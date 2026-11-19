export function scanArchive(text: string): {
  duplicate: boolean;
  tooDeep: boolean;
} {
  const stack: Array<Set<string> | null> = [];
  let duplicate = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === "{" || char === "[") {
      stack.push(char === "{" ? new Set() : null);
      if (stack.length > 64) return { duplicate, tooDeep: true };
    } else if (char === "}" || char === "]") stack.pop();
    else if (char === '"') {
      const start = i++;
      while (i < text.length && text[i] !== '"') {
        if (text[i] === "\\") i++;
        i++;
      }
      let next = i + 1;
      while (next < text.length && /\s/.test(text[next] ?? "")) next++;
      const keys = stack.at(-1);
      if (text[next] === ":" && keys) {
        const key = JSON.parse(text.slice(start, i + 1)) as string;
        if (keys.has(key)) duplicate = true;
        keys.add(key);
      }
    }
  }
  return { duplicate, tooDeep: false };
}
