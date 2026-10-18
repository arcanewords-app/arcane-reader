import { createScanner, LanguageVariant, SyntaxKind } from 'typescript/unstable/ast';
import type { UrlSpan } from './normalize.js';

export interface Tok {
  k: 'word' | 'str' | 'tmpl' | 'sym';
  t: string;
  head?: string;
  spans?: UrlSpan[];
}

export function tokenize(text: string, jsx: boolean): Tok[] {
  const scanner = createScanner(true, jsx ? LanguageVariant.JSX : LanguageVariant.Standard, text);
  let kind = scanner.scan();
  const tokens: Tok[] = [];

  const advance = (): void => {
    const before = scanner.getTokenEnd();
    kind = scanner.scan();
    if (kind !== SyntaxKind.EndOfFile && scanner.getTokenEnd() <= before) {
      kind = scanner.scanJsxToken();
    }
    if (kind !== SyntaxKind.EndOfFile && scanner.getTokenEnd() <= before) {
      const sample = text.slice(before, before + 80).replace(/\n/g, '\\n');
      throw new Error(`scanner stuck at ${before}: ${sample}`);
    }
  };

  const readTemplateExpr = (): string => {
    let depthBrace = 0;
    let depthParen = 0;
    let depthBracket = 0;
    let expr = '';
    while (kind !== SyntaxKind.EndOfFile) {
      if (kind === SyntaxKind.TemplateHead || kind === SyntaxKind.NoSubstitutionTemplateLiteral) {
        const nested = readTemplate();
        expr += `\`${nested.head}\``;
        continue;
      }
      if (kind === SyntaxKind.OpenBraceToken) depthBrace++;
      if (kind === SyntaxKind.CloseBraceToken) {
        if (depthBrace === 0 && depthParen === 0 && depthBracket === 0) break;
        depthBrace--;
      }
      if (kind === SyntaxKind.OpenParenToken) depthParen++;
      if (kind === SyntaxKind.CloseParenToken) depthParen--;
      if (kind === SyntaxKind.OpenBracketToken) depthBracket++;
      if (kind === SyntaxKind.CloseBracketToken) depthBracket--;
      expr += scanner.getTokenText();
      advance();
    }
    return expr;
  };

  const readTemplate = (): { head: string; spans: UrlSpan[] } => {
    if (kind === SyntaxKind.NoSubstitutionTemplateLiteral) {
      const head = scanner.getTokenValue();
      advance();
      return { head, spans: [] };
    }
    const head = scanner.getTokenValue();
    const spans: UrlSpan[] = [];
    advance();
    while (true) {
      const expr = readTemplateExpr();
      kind = scanner.reScanTemplateToken(false);
      spans.push({ expr, literal: scanner.getTokenValue() });
      if (kind !== SyntaxKind.TemplateMiddle) {
        advance();
        break;
      }
      advance();
    }
    return { head, spans };
  };

  while (kind !== SyntaxKind.EndOfFile) {
    if (kind === SyntaxKind.TemplateHead || kind === SyntaxKind.NoSubstitutionTemplateLiteral) {
      const template = readTemplate();
      tokens.push({ k: 'tmpl', t: template.head, head: template.head, spans: template.spans });
      continue;
    }
    const sym = punct(kind);
    if (sym) tokens.push({ k: 'sym', t: sym });
    else if (kind === SyntaxKind.StringLiteral)
      tokens.push({ k: 'str', t: scanner.getTokenValue() });
    else tokens.push({ k: 'word', t: scanner.getTokenText() });
    advance();
  }

  return tokens;
}

function punct(kind: SyntaxKind): string | null {
  switch (kind) {
    case SyntaxKind.OpenBraceToken:
      return '{';
    case SyntaxKind.CloseBraceToken:
      return '}';
    case SyntaxKind.OpenParenToken:
      return '(';
    case SyntaxKind.CloseParenToken:
      return ')';
    case SyntaxKind.OpenBracketToken:
      return '[';
    case SyntaxKind.CloseBracketToken:
      return ']';
    case SyntaxKind.DotToken:
      return '.';
    case SyntaxKind.CommaToken:
      return ',';
    case SyntaxKind.SemicolonToken:
      return ';';
    case SyntaxKind.LessThanToken:
      return '<';
    case SyntaxKind.GreaterThanToken:
      return '>';
    case SyntaxKind.SlashToken:
      return '/';
    case SyntaxKind.EqualsToken:
      return '=';
    case SyntaxKind.ColonToken:
      return ':';
    case SyntaxKind.QuestionToken:
      return '?';
    case SyntaxKind.BarToken:
      return '|';
    case SyntaxKind.AsteriskToken:
      return '*';
    case SyntaxKind.EqualsGreaterThanToken:
      return '=>';
    default:
      return null;
  }
}
