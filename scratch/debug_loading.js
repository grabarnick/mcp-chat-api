import fs from 'fs';
import path from 'path';

const USER_FUNCTIONS_PATH = path.join(process.cwd(), "project", "Демо-бот-JustAI", "userFunctions.json");

console.log("Checking path:", USER_FUNCTIONS_PATH);

if (fs.existsSync(USER_FUNCTIONS_PATH)) {
    console.log("File exists!");
    try {
        const content = fs.readFileSync(USER_FUNCTIONS_PATH, "utf8");
        const data = JSON.parse(content);
        console.log("Successfully parsed JSON. Number of functions:", data.length);
        const fn = data.find(f => f.name === "questionsStepsList");
        if (fn) {
            console.log("Found questionsStepsList!");
            console.log("Code length:", fn.code.length);
        } else {
            console.log("questionsStepsList NOT found in JSON.");
            console.log("Available names:", data.map(f => f.name).slice(0, 10));
        }
    } catch (e) {
        console.error("Error reading/parsing:", e.message);
    }
} else {
    console.log("File does NOT exist at this path.");
    // Check if project dir exists
    const projectPath = path.join(process.cwd(), "project");
    if (fs.existsSync(projectPath)) {
        console.log("Project dir exists. Contents:", fs.readdirSync(projectPath));
    } else {
        console.log("Project dir does NOT exist.");
    }
}
