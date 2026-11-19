const identifierPattern = /^[A-Za-z_][A-Za-z0-9_$]*$/;

function quoteIdentifier(identifier) {
  if (typeof identifier !== "string" || !identifierPattern.test(identifier)) {
    throw new Error("MariaDB auth schema contains an invalid SQL identifier");
  }
  return `\`${identifier}\``;
}

function columnType(type, fieldKey, field) {
  if (
    type === "string" &&
    (field.returned === false || ["image", "scope", "userAgent", "value"].includes(fieldKey))
  ) {
    return "TEXT";
  }
  const types = {
    string: "VARCHAR(255)",
    number: "DOUBLE",
    boolean: "BOOLEAN",
    date: "DATETIME(3)",
    json: "LONGTEXT",
    "string[]": "LONGTEXT",
    "number[]": "LONGTEXT",
  };
  const sqlType = types[type];
  if (!sqlType) throw new Error(`Unsupported Better Auth field type: ${type}`);
  return sqlType;
}

function defaultValueSql(value) {
  if (typeof value === "boolean") return value ? " DEFAULT TRUE" : " DEFAULT FALSE";
  if (typeof value === "number" && Number.isFinite(value)) return ` DEFAULT ${value}`;
  if (typeof value === "string") return ` DEFAULT '${value.replaceAll("'", "''")}'`;
  return "";
}

function indexName(prefix, model, field) {
  return `${prefix}_${model}_${field}`.replaceAll(/[^A-Za-z0-9_]/g, "_").slice(0, 60);
}

export function createMariaDbAuthTableStatements(tables) {
  const models = Object.entries(tables).sort(([, a], [, b]) => (a.order || 0) - (b.order || 0));

  return models.map(([modelKey, table]) => {
    const modelName = table.modelName || modelKey;
    const fields = Object.entries(table.fields || {});
    const columns = ["`id` VARCHAR(255) NOT NULL PRIMARY KEY"];
    const indexes = [];
    const constraints = [];

    for (const [fieldKey, field] of fields) {
      const fieldName = field.fieldName || fieldKey;
      const required = field.required ? " NOT NULL" : " NULL";
      columns.push(
        `${quoteIdentifier(fieldName)} ${columnType(field.type, fieldKey, field)}${required}${defaultValueSql(field.defaultValue)}`,
      );

      if (field.unique)
        indexes.push(
          `UNIQUE KEY ${quoteIdentifier(indexName("uniq", modelName, fieldName))} (${quoteIdentifier(fieldName)})`,
        );
      else if (field.index)
        indexes.push(
          `KEY ${quoteIdentifier(indexName("idx", modelName, fieldName))} (${quoteIdentifier(fieldName)})`,
        );

      if (field.references) {
        const referencedModel = tables[field.references.model];
        if (!referencedModel)
          throw new Error(`Unknown Better Auth reference model: ${field.references.model}`);
        const referencedField =
          field.references.field === "id"
            ? "id"
            : referencedModel.fields?.[field.references.field]?.fieldName || field.references.field;
        const onDelete = {
          cascade: "CASCADE",
          restrict: "RESTRICT",
          "set null": "SET NULL",
          "no action": "NO ACTION",
        }[String(field.references.onDelete || "no action").toLowerCase()];
        if (!onDelete) throw new Error("Unsupported Better Auth foreign-key action");
        constraints.push(
          `CONSTRAINT ${quoteIdentifier(indexName("fk", modelName, fieldName))} FOREIGN KEY (${quoteIdentifier(fieldName)}) REFERENCES ${quoteIdentifier(referencedModel.modelName || field.references.model)} (${quoteIdentifier(referencedField)}) ON DELETE ${onDelete}`,
        );
      }
    }

    return `CREATE TABLE IF NOT EXISTS ${quoteIdentifier(modelName)} (\n  ${[...columns, ...indexes, ...constraints].join(",\n  ")}\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;
  });
}
