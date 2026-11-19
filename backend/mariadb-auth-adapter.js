import { AsyncLocalStorage } from "node:async_hooks";
import { createAdapterFactory } from "better-auth/adapters";

const transactionContext = new AsyncLocalStorage();
const identifierPattern = /^[A-Za-z_][A-Za-z0-9_$]*$/;

function quoteIdentifier(identifier) {
  if (typeof identifier !== "string" || !identifierPattern.test(identifier)) {
    throw new Error("MariaDB adapter received an invalid SQL identifier");
  }
  return `\`${identifier}\``;
}

function escapeLikeValue(value) {
  return String(value).replace(/[\\%_]/g, "\\$&");
}

export function buildMariaDbWhereClause(where = []) {
  const values = [];
  const clauses = where.map(
    ({ field, value, operator = "eq", connector = "AND", mode = "sensitive" }, index) => {
      const quotedField = quoteIdentifier(field);
      const useInsensitiveMatch =
        mode === "insensitive" &&
        (typeof value === "string" ||
          (Array.isArray(value) && value.every((item) => typeof item === "string")));
      const column = useInsensitiveMatch
        ? `LOWER(${quotedField})`
        : typeof value === "string"
          ? `BINARY ${quotedField}`
          : quotedField;
      const normalizeValue = (item) =>
        useInsensitiveMatch && typeof item === "string" ? item.toLowerCase() : item;

      let clause;
      if (operator === "eq" || operator === "ne") {
        if (value === null) {
          clause = `${quotedField} IS ${operator === "ne" ? "NOT " : ""}NULL`;
        } else {
          clause = `${column} ${operator === "ne" ? "<>" : "="} ?`;
          values.push(normalizeValue(value));
        }
      } else if (["lt", "lte", "gt", "gte"].includes(operator)) {
        const comparison = { lt: "<", lte: "<=", gt: ">", gte: ">=" }[operator];
        clause = `${quotedField} ${comparison} ?`;
        values.push(value);
      } else if (operator === "in" || operator === "not_in") {
        if (!Array.isArray(value)) throw new Error(`MariaDB adapter expected an array for ${operator}`);
        if (value.length === 0) {
          clause = operator === "in" ? "1 = 0" : "1 = 1";
        } else {
          clause = `${column} ${operator === "not_in" ? "NOT " : ""}IN (${value.map(() => "?").join(", ")})`;
          values.push(...value.map(normalizeValue));
        }
      } else if (["contains", "starts_with", "ends_with"].includes(operator)) {
        const pattern = escapeLikeValue(value);
        const likeValue =
          operator === "contains"
            ? `%${pattern}%`
            : operator === "starts_with"
              ? `${pattern}%`
              : `%${pattern}`;
        const likeColumn = mode === "insensitive" ? `LOWER(${quotedField})` : `BINARY ${quotedField}`;
        clause = `${likeColumn} LIKE ? ESCAPE '\\\\'`;
        values.push(mode === "insensitive" ? likeValue.toLowerCase() : likeValue);
      } else {
        throw new Error(`MariaDB adapter does not support the ${operator} where operator`);
      }

      return index === 0 ? clause : `${connector === "OR" ? "OR" : "AND"} ${clause}`;
    },
  );

  return { sql: clauses.length ? ` WHERE ${clauses.join(" ")}` : "", values };
}

function selectColumns(select) {
  if (!Array.isArray(select) || select.length === 0) return "*";
  return select.map(quoteIdentifier).join(", ");
}

export function createMariaDbAuthAdapter(pool) {
  let adapterInstance;

  const adapterFactory = createAdapterFactory({
    config: {
      adapterId: "mariadb",
      adapterName: "MariaDB",
      supportsJSON: false,
      supportsDates: true,
      supportsBooleans: false,
      transaction: async (callback) => {
        const connection = await pool.getConnection();
        await connection.beginTransaction();
        try {
          const result = await transactionContext.run(connection, () => callback(adapterInstance));
          await connection.commit();
          return result;
        } catch (error) {
          await connection.rollback();
          throw error;
        } finally {
          connection.release();
        }
      },
    },
    adapter: ({ getFieldName }) => {
      const query = (sql, values = []) => (transactionContext.getStore() || pool).query(sql, values);

      async function findOne({ model, where, select }) {
        const condition = buildMariaDbWhereClause(where);
        const rows = await query(
          `SELECT ${selectColumns(select)} FROM ${quoteIdentifier(model)}${condition.sql} LIMIT 1`,
          condition.values,
        );
        return rows[0] || null;
      }

      return {
        create: async ({ model, data }) => {
          const columns = Object.keys(data);
          if (columns.length === 0) throw new Error("MariaDB adapter cannot create an empty record");
          const result = await query(
            `INSERT INTO ${quoteIdentifier(model)} (${columns.map(quoteIdentifier).join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
            columns.map((column) => data[column]),
          );
          return {
            ...data,
            ...(data.id === undefined && result.insertId ? { id: String(result.insertId) } : {}),
          };
        },

        findOne,

        findMany: async ({ model, where, select, sortBy, limit, offset }) => {
          const condition = buildMariaDbWhereClause(where);
          const order = sortBy
            ? ` ORDER BY ${quoteIdentifier(sortBy.field)} ${sortBy.direction === "desc" ? "DESC" : "ASC"}`
            : "";
          const boundedLimit = Number.isSafeInteger(limit) && limit >= 0 ? limit : 100;
          const boundedOffset = Number.isSafeInteger(offset) && offset >= 0 ? offset : 0;
          const pagination = boundedOffset > 0 ? " LIMIT ? OFFSET ?" : " LIMIT ?";
          const values = [
            ...condition.values,
            ...(boundedOffset > 0 ? [boundedLimit, boundedOffset] : [boundedLimit]),
          ];
          return query(
            `SELECT ${selectColumns(select)} FROM ${quoteIdentifier(model)}${condition.sql}${order}${pagination}`,
            values,
          );
        },

        count: async ({ model, where }) => {
          const condition = buildMariaDbWhereClause(where);
          const rows = await query(
            `SELECT COUNT(*) AS total FROM ${quoteIdentifier(model)}${condition.sql}`,
            condition.values,
          );
          return Number(rows[0]?.total || 0);
        },

        update: async ({ model, modelKey, where, update }) => {
          const existing = await findOne({ model, where });
          if (!existing) return null;
          const entries = Object.entries(update).filter(([, value]) => value !== undefined);
          if (entries.length > 0) {
            const condition = buildMariaDbWhereClause(where);
            await query(
              `UPDATE ${quoteIdentifier(model)} SET ${entries.map(([field]) => `${quoteIdentifier(field)} = ?`).join(", ")}${condition.sql} LIMIT 1`,
              [...entries.map(([, value]) => value), ...condition.values],
            );
          }
          const idField = getFieldName({ model: modelKey || model, field: "id" });
          const idValue = existing[idField] ?? existing.id;
          if (idValue === undefined || idValue === null) return existing;
          return findOne({ model, where: [{ field: idField, value: idValue }] });
        },

        updateMany: async ({ model, where, update }) => {
          const entries = Object.entries(update).filter(([, value]) => value !== undefined);
          if (entries.length === 0) return 0;
          const condition = buildMariaDbWhereClause(where);
          const result = await query(
            `UPDATE ${quoteIdentifier(model)} SET ${entries.map(([field]) => `${quoteIdentifier(field)} = ?`).join(", ")}${condition.sql}`,
            [...entries.map(([, value]) => value), ...condition.values],
          );
          return Number(result.affectedRows || 0);
        },

        delete: async ({ model, where }) => {
          if (!where?.length) throw new Error("MariaDB adapter requires a condition for delete");
          const condition = buildMariaDbWhereClause(where);
          await query(`DELETE FROM ${quoteIdentifier(model)}${condition.sql} LIMIT 1`, condition.values);
        },

        deleteMany: async ({ model, where }) => {
          const condition = buildMariaDbWhereClause(where);
          const result = await query(
            `DELETE FROM ${quoteIdentifier(model)}${condition.sql}`,
            condition.values,
          );
          return Number(result.affectedRows || 0);
        },
      };
    },
  });

  return (options) => {
    adapterInstance = adapterFactory(options);
    return adapterInstance;
  };
}
