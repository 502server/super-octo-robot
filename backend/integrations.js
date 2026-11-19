import {Router} from "express";
import {roleGuard} from "./access.js";
import {DEEPSEEK_MODEL_ID} from "./ai-config.js";

export function createIntegrationRouter(auth){
 const router=Router();
 const base=()=> (process.env.DEEPSEEK_BASE_URL||"https://api.deepseek.com").replace(/\/$/,"");
 const deepseekKey=()=>process.env.DEEPSEEK_API_KEY?.trim()||"";
 router.get("/status",auth,(_req,res)=>{
  const present=k=>Boolean(process.env[k]?.trim());
  res.json({integrations:[
   {id:"deepseek",name:"DeepSeek AI Assistant",state:"configured",model:DEEPSEEK_MODEL_ID,route:"Vercel AI Gateway",note:"Vercel AI Gateway manages model access; no DeepSeek API key is stored by this application."},
   {id:"hasura",name:"Hasura GraphQL",state:present("HASURA_GRAPHQL_ENDPOINT")&&present("HASURA_ADMIN_SECRET")?"configured":present("HASURA_GRAPHQL_ENDPOINT")?"partial":"missing",endpointPresent:present("HASURA_GRAPHQL_ENDPOINT"),adminSecretPresent:present("HASURA_ADMIN_SECRET"),jwtSecretPresent:present("HASURA_JWT_SECRET"),endpoint:process.env.HASURA_GRAPHQL_ENDPOINT||""},
   {id:"openshift",name:"OpenShift API",state:present("OPENSHIFT_USER_TOKEN")?"configured":"missing",credentialPresent:present("OPENSHIFT_USER_TOKEN"),endpoint:"https://api.rm2.thpm.p1.openshiftapps.com:6443"},
   {id:"session",name:"Session signing secret",state:present("SESSION_SECRET")?"configured":"missing"},
   {id:"bootstrap",name:"Owner bootstrap token",state:present("BOOTSTRAP_TOKEN")?"configured":"missing"},
   {id:"github",name:"GitHub App connection",state:"externally-managed",note:"Managed by the GitHub App connector; no personal access token is stored in this application."}
  ]});
 });
 router.post("/deepseek/test",auth,roleGuard("owner","admin"),async(_req,res)=>{
  const key=deepseekKey();
  if(!key)return res.status(409).json({ok:false,state:"missing",message:"DEEPSEEK_API_KEY is not configured on the server."});
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),8000);
  try{
   const response=await fetch(base()+"/models",{headers:{Authorization:"Bearer "+key},signal:ctl.signal});
   if(response.status===401||response.status===403)return res.status(200).json({ok:false,state:"invalid",httpStatus:response.status,message:"DeepSeek rejected the configured credential."});
   if(!response.ok)return res.status(200).json({ok:false,state:"error",httpStatus:response.status,message:"DeepSeek endpoint returned an unsuccessful response."});
   return res.json({ok:true,state:"valid",httpStatus:response.status,model:process.env.DEEPSEEK_MODEL||"deepseek-chat",message:"DeepSeek API credential accepted."});
  }catch{
   return res.status(200).json({ok:false,state:"unreachable",message:"Could not reach the DeepSeek API. Check outbound network and base URL."});
  }finally{clearTimeout(timer)}
 });
 router.post("/hasura/test",auth,roleGuard("owner","admin"),async(_req,res)=>{
  const endpoint=process.env.HASURA_GRAPHQL_ENDPOINT,secret=process.env.HASURA_ADMIN_SECRET;
  if(!endpoint||!secret)return res.status(409).json({ok:false,state:"missing",message:"HASURA_GRAPHQL_ENDPOINT and HASURA_ADMIN_SECRET must be configured server-side."});
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),8000);
  try{
   const response=await fetch(endpoint,{method:"POST",headers:{"content-type":"application/json","x-hasura-admin-secret":secret},body:JSON.stringify({query:"query IntegrationHealth { __typename }"}),signal:ctl.signal});
   const body=await response.json().catch(()=>({}));
   if(response.status===401||response.status===403)return res.json({ok:false,state:"invalid",httpStatus:response.status,message:"Hasura rejected the configured admin secret."});
   if(!response.ok||body.errors)return res.json({ok:false,state:"error",httpStatus:response.status,message:"Hasura responded, but the health query failed."});
   return res.json({ok:true,state:"valid",httpStatus:response.status,message:"Hasura GraphQL endpoint and admin secret accepted."});
  }catch{return res.json({ok:false,state:"unreachable",message:"Could not reach the configured Hasura endpoint."})}
  finally{clearTimeout(timer)}
 });
 router.post("/openshift/test",auth,roleGuard("owner","admin","analyst"),async(_req,res)=>{
  const token=process.env.OPENSHIFT_USER_TOKEN?.trim();
  if(!token)return res.status(409).json({error:"OPENSHIFT_USER_TOKEN is not configured server-side."});
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),8000);
  try{
   const response=await fetch("https://api.rm2.thpm.p1.openshiftapps.com:6443/apis/user.openshift.io/v1/users/~",{headers:{Authorization:"Bearer "+token,Accept:"application/json"},signal:ctl.signal,redirect:"error"});
   if(response.status===401||response.status===403)return res.json({ok:false,state:"invalid",httpStatus:response.status,message:"OpenShift rejected the configured token."});
   if(!response.ok)return res.json({ok:false,state:"error",httpStatus:response.status,message:"OpenShift returned an unsuccessful identity response."});
   const identity=await response.json().catch(()=>null),username=identity?.metadata?.name;
   if(typeof username!=="string"||!username)return res.json({ok:false,state:"error",message:"OpenShift returned an unexpected identity response."});
   return res.json({ok:true,state:"valid",httpStatus:response.status,message:"Authenticated as "+username+"."});
  }catch{return res.json({ok:false,state:"unreachable",message:"Could not reach the configured OpenShift API."})}
  finally{clearTimeout(timer)}
 });
 return router;
}
