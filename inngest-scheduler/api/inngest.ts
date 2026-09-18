import { serve } from "inngest/node";
import { inngest } from "../src/client.js";
import { functions } from "../src/functions.js";

export default serve({
  client: inngest,
  functions,
});
