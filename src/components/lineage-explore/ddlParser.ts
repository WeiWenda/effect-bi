export interface FieldInfo {
  name: string;
  type: string;
  comment: string;
}

export function parseDDL(ddl: string): FieldInfo[] {
  if (!ddl) return [];

  const fields: FieldInfo[] = [];
  
  // Remove CREATE EXTERNAL TABLE and table name
  const content = ddl
    .replace(/CREATE\s+(EXTERNAL\s+)?TABLE\s+`?[^`]+`?\s*\(/i, '')
    .replace(/\)\s*(COMMENT\s+[^;]+)?;?$/i, '');

  // Split by comma, but handle nested parentheses
  const lines: string[] = [];
  let current = '';
  let parenDepth = 0;

  for (const char of content) {
    if (char === '(') parenDepth++;
    if (char === ')') parenDepth--;
    
    if (char === ',' && parenDepth === 0) {
      lines.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) {
    lines.push(current.trim());
  }

  // Parse each line
  for (const line of lines) {
    // Skip partitioned by, row format, stored as, etc.
    if (line.match(/^(PARTITIONED BY|ROW FORMAT|LINES TERMINATED|STORED AS|LOCATION|TBLPROPERTIES)/i)) {
      continue;
    }

    // Parse field definition
    const fieldMatch = line.match(/`?(\w+)`?\s+(\w+(?:\(\d+(?:,\s*\d+)?\))?)\s*(?:comment\s+['"]([^'"]*)['"])?/i);
    if (fieldMatch) {
      fields.push({
        name: fieldMatch[1],
        type: fieldMatch[2],
        comment: fieldMatch[3] || ''
      });
    }
  }

  return fields;
}
