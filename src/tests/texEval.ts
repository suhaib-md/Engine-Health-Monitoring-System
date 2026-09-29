/**
 * A tiny LaTeX → JavaScript translator for the subset the calculation substitution templates
 * use (fractions, roots, powers, e^, min/max/clip, cos/sin, \cdot, \times, brackets, thousands
 * separators {,}). Tests use it to prove each substituted formula evaluates to the equation's own
 * compute(), so what a reader sees on screen is the arithmetic the simulator does.
 */

type Tok = { kind: 'operand' | 'open' | 'close' | 'op' | 'fn' | 'comma'; text: string };

function readGroup(s: string, i: number): [string, number] {
  // skip spacing commands before a group
  while (s[i] === ' ') i++;
  if (s[i] !== '{') return [s[i]!, i + 1]; // \tfrac12 style single-character argument
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    if (s[j] === '{') depth++;
    else if (s[j] === '}' && --depth === 0) return [s.slice(i + 1, j), j + 1];
  }
  throw new Error(`unbalanced group in ${s}`);
}

function translate(s: string): Tok[] {
  const out: Tok[] = [];
  const push = (t: Tok) => {
    const prev = out[out.length - 1];
    const startsOperand = t.kind === 'operand' || t.kind === 'open' || t.kind === 'fn';
    if (startsOperand && prev && (prev.kind === 'operand' || prev.kind === 'close'))
      out.push({ kind: 'op', text: '*' }); // implicit multiplication
    out.push(t);
  };
  const sub = (x: string) => {
    push({ kind: 'open', text: '(' });
    for (const t of translate(x)) out.push(t);
    out.push({ kind: 'close', text: ')' });
  };
  let i = 0;
  while (i < s.length) {
    const c = s[i]!;
    if (s.startsWith('{,}', i)) {
      i += 3; // thousands separator inside a number
      continue;
    }
    if (c === '\\') {
      const m = /^\\([a-zA-Z]+|.)/.exec(s.slice(i))!;
      const name = m[1]!;
      i += m[0].length;
      if (name === 'frac' || name === 'tfrac') {
        const [a, i1] = readGroup(s, i);
        const [b, i2] = readGroup(s, i1);
        i = i2;
        push({ kind: 'open', text: '(' });
        sub(a);
        out.push({ kind: 'op', text: '/' });
        sub(b);
        out.push({ kind: 'close', text: ')' });
      } else if (name === 'sqrt') {
        const [a, i1] = readGroup(s, i);
        i = i1;
        push({ kind: 'fn', text: 'Math.sqrt' });
        sub(a);
      } else if (name === 'left' || name === 'right') {
        // the bracket that follows is handled as a plain character
      } else if (name === 'cdot' || name === 'times') out.push({ kind: 'op', text: '*' });
      else if (name === 'pi') push({ kind: 'operand', text: 'Math.PI' });
      else if (name === 'min' || name === 'max') push({ kind: 'fn', text: `Math.${name}` });
      else if (name === 'cos' || name === 'sin') push({ kind: 'fn', text: `Math.${name}` });
      else if (name === 'operatorname') {
        const [a, i1] = readGroup(s, i);
        i = i1;
        push({ kind: 'fn', text: a });
      } else if (name === 'circ') {
        /* degrees: a label only */
      } else if (name === 'textcolor') {
        const [, i1] = readGroup(s, i); // drop the colour, keep the content
        i = i1;
      } else if ([',', ' ', '!', ';', 'quad', 'qquad'].includes(name)) {
        /* spacing */
      } else throw new Error(`unsupported command \\${name}`);
      continue;
    }
    if (c === 'e' && s[i + 1] === '^') {
      const [a, i1] = readGroup(s, i + 2);
      i = i1;
      push({ kind: 'fn', text: 'Math.exp' });
      sub(a);
      continue;
    }
    if (c === '^' && s.startsWith('\\circ', i + 1)) {
      i += 6; // degrees: a label only
      continue;
    }
    if (c === '^') {
      const [a, i1] = readGroup(s, i + 1);
      i = i1;
      if (a === '\\circ') continue;
      out.push({ kind: 'op', text: '**' });
      sub(a);
      continue;
    }
    if (c === '(' || c === '[' || c === '{') {
      push({ kind: 'open', text: '(' });
      i++;
      continue;
    }
    if (c === ')' || c === ']' || c === '}') {
      out.push({ kind: 'close', text: ')' });
      i++;
      continue;
    }
    if (c === ',') {
      out.push({ kind: 'comma', text: ',' });
      i++;
      continue;
    }
    if ('+-*/'.includes(c)) {
      out.push({ kind: 'op', text: c });
      i++;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      const m = /^[0-9.]+(?:\{,\}[0-9]+)*/.exec(s.slice(i))!;
      i += m[0].length;
      push({ kind: 'operand', text: m[0].replace(/\{,\}/g, '') });
      continue;
    }
    if (c === ' ' || c === '&') {
      i++;
      continue;
    }
    throw new Error(`unexpected '${c}' at ${i} in ${s}`);
  }
  return out;
}

const clip = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

export function evalTex(tex: string): number {
  const js = translate(tex)
    .map((t) => t.text)
    .join(' ');
  return new Function('clip', `return (${js});`)(clip) as number;
}
