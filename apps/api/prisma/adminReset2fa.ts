import { defaultAdmin, parseArgs, printBootstrapResult, resetAdminTwoFactor } from "./adminBootstrapShared.js";

const args = parseArgs(process.argv.slice(2));
const email = args.get("email") ?? defaultAdmin.email;

const result = await resetAdminTwoFactor({ email });
printBootstrapResult(result);
