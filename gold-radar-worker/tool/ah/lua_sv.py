"""Reads a WoW SavedVariables file (plain Lua table assignments) into Python dicts/lists.

Only data is parsed, nothing is executed. Supports what the game client writes:
    Name = { ["key"] = value, [123] = value, value, ... }
with strings, numbers, true/false/nil and nested tables, plus -- comments.
"""
import re

_TOKEN = re.compile(r'''
    (?P<ws>\s+|--\[\[.*?\]\]|--[^\n]*)
  | (?P<str>"(?:\\.|[^"\\])*")
  | (?P<num>-?(?:0[xX][0-9a-fA-F]+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)|-?inf|nan)
  | (?P<name>[A-Za-z_][A-Za-z0-9_]*)
  | (?P<sym>[{}\[\]=,;])
''', re.S | re.X)

_ESC = {'n': '\n', 't': '\t', 'r': '\r', '\\': '\\', '"': '"', "'": "'", 'a': '\a', 'b': '\b', 'f': '\f', 'v': '\v'}


def _unquote(s):
    s = s[1:-1]
    if '\\' not in s:
        return s
    out, i = [], 0
    while i < len(s):
        c = s[i]
        if c == '\\' and i + 1 < len(s):
            n = s[i + 1]
            if n.isdigit():
                m = re.match(r'\d{1,3}', s[i + 1:])
                out.append(chr(int(m.group())))
                i += 1 + len(m.group())
                continue
            if n == '\n':
                out.append('\n')
            else:
                out.append(_ESC.get(n, n))
            i += 2
        else:
            out.append(c)
            i += 1
    return ''.join(out)


def _tokens(text):
    pos = 0
    for m in _TOKEN.finditer(text):
        if m.start() != pos:
            raise ValueError(f'unexpected character at {pos}: {text[pos:pos + 30]!r}')
        pos = m.end()
        kind = m.lastgroup
        if kind == 'ws':
            continue
        yield kind, m.group(kind)
    if pos != len(text):
        raise ValueError(f'unexpected character at {pos}: {text[pos:pos + 30]!r}')


class _Parser:
    def __init__(self, text):
        self.toks = list(_tokens(text))
        self.i = 0

    def peek(self):
        return self.toks[self.i] if self.i < len(self.toks) else (None, None)

    def take(self, value=None):
        tok = self.peek()
        if value is not None and tok[1] != value:
            raise ValueError(f'expected {value!r}, got {tok[1]!r} at token {self.i}')
        self.i += 1
        return tok

    def value(self):
        kind, v = self.take()
        if kind == 'str':
            return _unquote(v)
        if kind == 'num':
            if v.lower().lstrip('-') in ('inf', 'nan'):
                return float(v)
            if v.lower().startswith(('0x', '-0x')):
                return int(v, 16)
            f = float(v)
            return int(f) if f.is_integer() and not re.search(r'[.eE]', v) else f
        if kind == 'name':
            return {'true': True, 'false': False, 'nil': None}.get(v, v)
        if v == '{':
            return self.table()
        raise ValueError(f'unexpected {v!r} at token {self.i}')

    def table(self):
        d, arr = {}, []
        while True:
            kind, v = self.peek()
            if v == '}':
                self.take()
                break
            if v == '[':
                self.take()
                key = self.value()
                self.take(']')
                self.take('=')
                d[key] = self.value()
            elif kind == 'name' and self.toks[self.i + 1][1] == '=':
                self.take()
                self.take('=')
                d[v] = self.value()
            else:
                arr.append(self.value())
            if self.peek()[1] in (',', ';'):
                self.take()
        if arr and not d:
            return arr
        for n, v in enumerate(arr, 1):
            d.setdefault(n, v)
        return d


def load(path):
    """Returns {VariableName: value} for every top-level assignment in the file."""
    return loads(open(path, encoding='utf-8', errors='replace').read())


def loads(text):
    """Same as load() for the file's text (e.g. an uploaded file)."""
    p = _Parser(text)
    out = {}
    while p.peek()[0] is not None:
        _, name = p.take()
        p.take('=')
        out[name] = p.value()
    return out


def as_list(v):
    """Lua arrays come back as lists, or as {1: .., 2: ..} dicts when mixed; normalise to a list."""
    if isinstance(v, list):
        return v
    if isinstance(v, dict):
        return [v[k] for k in sorted(k for k in v if isinstance(k, int))]
    return []
