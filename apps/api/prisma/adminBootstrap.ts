import { bootstrapAdmin, defaultAdmin, parseArgs, printBootstrapResult } from "./adminBootstrapShared.js";

const args = parseArgs(process.argv.slice(2));
const email = args.get("email") ?? defaultAdmin.email;
const password = args.get("password") ?? defaultAdmin.password;
const name = args.get("name") ?? defaultAdmin.name;
const force = args.get("force") === "true";

const result = await bootstrapAdmin({ email, password, name, force });
printBootstrapResult(result, password);
