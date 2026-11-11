import fs from "fs";
import path from "path";

const srcDir = path.resolve("src");
const extensions = [".ts", ".tsx", ".js", ".jsx"];

function getAllFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getAllFiles(fullPath));
    } else if (extensions.includes(path.extname(fullPath))) {
      results.push(fullPath);
    }
  });
  return results;
}

const files = getAllFiles(srcDir);
const graph = new Map();

function resolveImport(importPath, currentFile) {
  let target;
  if (importPath.startsWith(".")) {
    target = path.resolve(path.dirname(currentFile), importPath);
  } else if (importPath.startsWith("@/")) {
    target = path.resolve(srcDir, importPath.slice(2));
  } else {
    return null; // External package
  }

  for (const ext of ["", ...extensions, "/index.ts", "/index.tsx", "/index.js"]) {
    const candidate = target + ext;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return path.normalize(candidate);
    }
  }
  return null;
}

for (const file of files) {
  const content = fs.readFileSync(file, "utf8");
  const imports = [];
  // Match only value imports, not `import type ...` or `export type ...`
  const importRegex = /(?:^|\n)\s*(?:import|export)\s+(?!type\s)(?:(?:(?:\w+|\{[^}]*\}|\*\s+as\s+\w+)\s+from\s+)?|.*?from\s+)['"]([^'"]+)['"]/g;
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    const resolved = resolveImport(match[1], file);
    if (resolved && resolved !== file) {
      imports.push(resolved);
    }
  }
  graph.set(path.normalize(file), imports);
}

const cycles = [];
const visited = new Set();
const recStack = [];

function findCycles(node) {
  visited.add(node);
  recStack.push(node);

  const neighbors = graph.get(node) || [];
  for (const neighbor of neighbors) {
    const idx = recStack.indexOf(neighbor);
    if (idx !== -1) {
      cycles.push([...recStack.slice(idx), neighbor]);
    } else if (!visited.has(neighbor)) {
      findCycles(neighbor);
    }
  }

  recStack.pop();
}

for (const file of files) {
  findCycles(path.normalize(file));
}

if (cycles.length === 0) {
  console.log("No circular dependencies found in src/!");
} else {
  console.log(`Found ${cycles.length} circular dependency cycle(s):`);
  cycles.forEach((cycle, i) => {
    console.log(`\nCycle ${i + 1}:`);
    console.log(cycle.map((p) => path.relative(process.cwd(), p).replace(/\\/g, "/")).join(" -> "));
  });
}
