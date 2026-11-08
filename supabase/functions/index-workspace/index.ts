import { createIndexHandler } from "./worker.mjs";
Deno.serve(createIndexHandler({env:(name:string)=>Deno.env.get(name)}));
