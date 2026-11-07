import { createChatHandler } from "./handler.mjs";

Deno.serve(createChatHandler({ env: (name: string) => Deno.env.get(name) }));
