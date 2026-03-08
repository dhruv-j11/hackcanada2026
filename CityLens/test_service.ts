import { simulateZoningChange } from "./src/services/geminiService";
import dotenv from "dotenv";

dotenv.config({ path: ".env" });

async function run() {
    console.log("Testing exactly the geminiService function...");
    const res = await simulateZoningChange("Build a shopping mall on King st");
    console.dir(res, { depth: null });
}

run();
