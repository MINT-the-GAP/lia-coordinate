export type CompiledFunctionExpression = {
  prepared: string;
  ascii: string;
  normalized: string;
  fn: ((x: number) => number) | null;
};

type Token = { type: 'number' | 'ident' | 'op' | 'open' | 'close'; value: string };

const FUNCTIONS = new Set([
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'arcsin', 'arccos', 'arctan',
  'sinh', 'cosh', 'tanh', 'sqrt', 'exp', 'ln', 'log', 'abs', 'floor', 'ceil',
  'round', 'min', 'max', 'pow'
]);

function skipSpaces(value: string, index: number): number {
  while (index < value.length && /\s/.test(value[index])) index += 1;
  return index;
}

function balanced(value: string, start: number, open: string, close: string): { content: string; end: number } {
  if (value[start] !== open) throw new Error('Expected ' + open);
  let depth = 0;
  for (let index = start; index < value.length; index += 1) {
    if (value[index] === open) depth += 1;
    else if (value[index] === close && --depth === 0) {
      return { content: value.slice(start + 1, index), end: index + 1 };
    }
  }
  throw new Error('Unclosed bracket: ' + open);
}

function readToken(value: string, start: number): { text: string; end: number } | null {
  const index = skipSpaces(value, start);
  if (index >= value.length) return null;
  const char = value[index];
  if (char === '{' || char === '(' || char === '[') {
    const close = char === '{' ? '}' : (char === '(' ? ')' : ']');
    const group = balanced(value, index, char, close);
    return { text: char === '{' ? group.content : char + group.content + close, end: group.end };
  }
  if (char === '\\') {
    let end = index + 1;
    while (end < value.length && /[A-Za-z]/.test(value[end])) end += 1;
    return { text: value.slice(index, end), end };
  }
  if (/[0-9.]/.test(char)) {
    let end = index + 1;
    while (end < value.length && /[0-9.]/.test(value[end])) end += 1;
    return { text: value.slice(index, end), end };
  }
  if (/[A-Za-z]/.test(char)) {
    let end = index + 1;
    while (end < value.length && /[A-Za-z0-9]/.test(value[end])) end += 1;
    return { text: value.slice(index, end), end };
  }
  return { text: char, end: index + 1 };
}

export function transformLatex(input: unknown): string {
  const value = String(input || '');
  const functionMap: Record<string, string> = {
    sin: 'sin', cos: 'cos', tan: 'tan', asin: 'asin', acos: 'acos', atan: 'atan',
    arcsin: 'arcsin', arccos: 'arccos', arctan: 'arctan', sinh: 'sinh', cosh: 'cosh',
    tanh: 'tanh', ln: 'ln', log: 'log', exp: 'exp', abs: 'abs'
  };
  let output = '';
  let index = 0;
  while (index < value.length) {
    const char = value[index];
    if (char !== '\\') {
      if (char === '{') {
        const group = balanced(value, index, '{', '}');
        output += '(' + transformLatex(group.content) + ')';
        index = group.end;
      } else if (char === '^') {
        const argument = readToken(value, index + 1);
        if (!argument) throw new Error('Exponent after ^ missing.');
        output += '^(' + transformLatex(argument.text) + ')';
        index = argument.end;
      } else if (char === '_') {
        const argument = readToken(value, index + 1);
        index = argument ? argument.end : index + 1;
      } else {
        output += char;
        index += 1;
      }
      continue;
    }

    let end = index + 1;
    while (end < value.length && /[A-Za-z]/.test(value[end])) end += 1;
    const command = value.slice(index + 1, end);
    if (!command) {
      const symbol = value[end] || '';
      if (!',;:! '.includes(symbol)) output += symbol;
      index = end + 1;
    } else if (command === 'left' || command === 'right') {
      index = end;
    } else if (command === 'cdot' || command === 'times') {
      output += '*'; index = end;
    } else if (command === 'div') {
      output += '/'; index = end;
    } else if (command === 'pi') {
      output += 'pi'; index = end;
    } else if (command === 'frac') {
      const numerator = readToken(value, end);
      if (!numerator) throw new Error('Numerator after \\frac missing.');
      const denominator = readToken(value, numerator.end);
      if (!denominator) throw new Error('Denominator after \\frac missing.');
      output += '((' + transformLatex(numerator.text) + ')/(' + transformLatex(denominator.text) + '))';
      index = denominator.end;
    } else if (command === 'sqrt') {
      let next = skipSpaces(value, end);
      let degree = '';
      if (value[next] === '[') {
        const group = balanced(value, next, '[', ']');
        degree = transformLatex(group.content);
        next = group.end;
      }
      const argument = readToken(value, next);
      if (!argument) throw new Error('Argument after \\sqrt missing.');
      const body = transformLatex(argument.text);
      output += degree ? '((' + body + ')^(1/(' + degree + ')))' : 'sqrt(' + body + ')';
      index = argument.end;
    } else if (command === 'mathrm' || command === 'operatorname' || command === 'text') {
      const argument = readToken(value, end);
      if (argument) output += transformLatex(argument.text);
      index = argument ? argument.end : end;
    } else if (functionMap[command]) {
      const argument = readToken(value, end);
      if (argument) {
        output += functionMap[command] + '(' + transformLatex(argument.text) + ')';
        index = argument.end;
      } else {
        output += functionMap[command];
        index = end;
      }
    } else {
      output += command;
      index = end;
    }
  }
  return output;
}

export function prepareFunctionInput(input: unknown): string {
  let value = String(input || '').trim()
    .replace(/^\${1,2}\s*/, '').replace(/\s*\${1,2}$/, '')
    .replace(/^\\\(|\\\)$/g, '').replace(/^\\\[|\\\]$/g, '')
    .replace(/[−–]/g, '-').replace(/·/g, '*')
    .replace(/\bMath\./g, '');
  value = value.replace(/^\s*[A-Za-z]+\s*\(\s*x\s*\)\s*=\s*/, '').replace(/^\s*y\s*=\s*/, '');
  for (let index = 0; index < 8; index += 1) {
    const next = value.replace(/(\d)\s*,\s*(\d)/g, '$1.$2');
    if (next === value) break;
    value = next;
  }
  return value.trim();
}

function tokenize(expression: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < expression.length) {
    const char = expression[index];
    if (/\s/.test(char)) { index += 1; continue; }
    if (/[0-9.]/.test(char)) {
      let end = index + 1;
      while (end < expression.length && /[0-9.]/.test(expression[end])) end += 1;
      const value = expression.slice(index, end);
      if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) throw new Error('Invalid number: ' + value);
      tokens.push({ type: 'number', value });
      index = end;
      continue;
    }
    if (/[A-Za-z]/.test(char)) {
      let end = index + 1;
      while (end < expression.length && /[A-Za-z0-9]/.test(expression[end])) end += 1;
      tokens.push({ type: 'ident', value: expression.slice(index, end).toLowerCase() });
      index = end;
      continue;
    }
    if (char === '*' && expression[index + 1] === '*') {
      tokens.push({ type: 'op', value: '**' });
      index += 2;
      continue;
    }
    if ('+-*/^,'.includes(char)) { tokens.push({ type: 'op', value: char }); index += 1; continue; }
    if (char === '(') { tokens.push({ type: 'open', value: char }); index += 1; continue; }
    if (char === ')') { tokens.push({ type: 'close', value: char }); index += 1; continue; }
    throw new Error('Unknown character in expression: ' + char);
  }
  return tokens;
}

export function normalizeFunctionExpression(
  expression: string,
  additionalFunctions: Iterable<string> = [],
  additionalVariables: Iterable<string> = []
): string {
  const allowedFunctions = new Set(FUNCTIONS);
  const allowedVariables = new Set<string>();
  for (const name of additionalFunctions) {
    const normalizedName = String(name || '').toLowerCase();
    if (/^[a-z][a-z0-9]*$/.test(normalizedName)) allowedFunctions.add(normalizedName);
  }
  for (const name of additionalVariables) {
    const normalizedName = String(name || '').toLowerCase();
    if (/^[a-z][a-z0-9]*$/.test(normalizedName)) allowedVariables.add(normalizedName);
  }
  const output: Token[] = [];
  tokenize(expression).forEach((token) => {
    const previous = output[output.length - 1];
    const valueEnd = previous && (previous.type === 'number' || previous.type === 'ident' || previous.type === 'close');
    const valueStart = token.type === 'number' || token.type === 'ident' || token.type === 'open';
    const functionCall = previous?.type === 'ident' && allowedFunctions.has(previous.value) && token.type === 'open';
    if (valueEnd && valueStart && !functionCall) output.push({ type: 'op', value: '*' });
    output.push(token);
  });
  return output.map((token) => {
    if (token.type === 'ident' && token.value !== 'x' && token.value !== 'pi' &&
        token.value !== 'e' && !allowedFunctions.has(token.value) && !allowedVariables.has(token.value)) {
      throw new Error('Unknown variable or function: ' + token.value);
    }
    return token.type === 'op' && token.value === '^' ? '**' : token.value;
  }).join('');
}

export function compileFunctionExpression(
  input: unknown,
  customFunctions: Record<string, (x: number) => number> = {},
  customVariables: Record<string, number | (() => number)> = {}
): CompiledFunctionExpression {
  const normalizedCustomFunctions = new Map<string, (x: number) => number>();
  Object.keys(customFunctions).forEach((name) => {
    const normalizedName = String(name || '').toLowerCase();
    if (!/^[a-z][a-z0-9]*$/.test(normalizedName) ||
        normalizedName === 'x' || normalizedName === 'pi' || normalizedName === 'e' ||
        FUNCTIONS.has(normalizedName) || typeof customFunctions[name] !== 'function') return;
    normalizedCustomFunctions.set(normalizedName, customFunctions[name]);
  });
  const normalizedCustomVariables = new Map<string, () => number>();
  Object.keys(customVariables).forEach((name) => {
    const normalizedName = String(name || '').toLowerCase();
    const value = customVariables[name];
    if (!/^[a-z][a-z0-9]*$/.test(normalizedName) ||
        normalizedName === 'x' || normalizedName === 'pi' || normalizedName === 'e' ||
        FUNCTIONS.has(normalizedName) || normalizedCustomFunctions.has(normalizedName)) return;
    normalizedCustomVariables.set(normalizedName, typeof value === 'function'
      ? () => Number((value as () => number)())
      : () => Number(value));
  });
  const prepared = prepareFunctionInput(input);
  const ascii = transformLatex(prepared);
  const customNames = Array.from(normalizedCustomFunctions.keys());
  const customValues = customNames.map((name) => normalizedCustomFunctions.get(name)!);
  const variableNames = Array.from(normalizedCustomVariables.keys());
  const variableGetters = variableNames.map((name) => normalizedCustomVariables.get(name)!);
  const normalized = normalizeFunctionExpression(ascii, customNames, variableNames);
  let fn: ((x: number) => number) | null = null;
  try {
    const evaluator = new Function('x', ...customNames, ...variableNames,
      'const pi=Math.PI,e=Math.E;' +
      'const sin=Math.sin,cos=Math.cos,tan=Math.tan,asin=Math.asin,acos=Math.acos,atan=Math.atan;' +
      'const arcsin=Math.asin,arccos=Math.acos,arctan=Math.atan,sinh=Math.sinh,cosh=Math.cosh,tanh=Math.tanh;' +
      'const exp=Math.exp,log=(Math.log10||((v)=>Math.log(v)/Math.LN10)),ln=Math.log,sqrt=Math.sqrt,abs=Math.abs;' +
      'const floor=Math.floor,ceil=Math.ceil,round=Math.round,min=Math.min,max=Math.max,pow=Math.pow;' +
      'return (' + normalized + ');'
    ) as (x: number, ...values: Array<number | ((x: number) => number)>) => number;
    fn = (x: number) => evaluator(x, ...customValues, ...variableGetters.map((getter) => getter()));
  } catch (e) {}
  return { prepared, ascii, normalized, fn };
}
