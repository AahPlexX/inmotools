import type { RegexCodeTarget } from './regex-types';

const jsString = (value: string) => JSON.stringify(value);
const pyString = (value: string) => `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const goString = (value: string) => '`' + value.replace(/`/g, '` + "`" + `') + '`';

export const generateRegexSnippet = (target: RegexCodeTarget, pattern: string, flags: string, subject: string): string => {
  const jsFlags = flags.replace(/[^dgimsuvy]/g, '');
  switch (target) {
    case 'javascript': return `const pattern = new RegExp(${jsString(pattern)}, ${jsString(jsFlags)});\nconst matches = [...${jsString(subject)}.matchAll(pattern.global ? pattern : new RegExp(pattern.source, pattern.flags + 'g'))];`;
    case 'typescript': return `const pattern: RegExp = new RegExp(${jsString(pattern)}, ${jsString(jsFlags)});\nconst matches = [...${jsString(subject)}.matchAll(pattern.global ? pattern : new RegExp(pattern.source, pattern.flags + 'g'))];`;
    case 'python': return `import re\npattern = re.compile(${pyString(pattern)}${flags.includes('i') ? ', re.IGNORECASE' : ''})\nmatches = list(pattern.finditer(${pyString(subject)}))`;
    case 'go': return `package main\n\nimport "regexp"\n\nvar pattern = regexp.MustCompile(${goString(pattern)})\nvar matches = pattern.FindAllString(${goString(subject)}, -1)`;
    case 'rust': return `use regex::Regex;\n\nlet pattern = Regex::new(${JSON.stringify(pattern)}).unwrap();\nlet matches: Vec<_> = pattern.find_iter(${JSON.stringify(subject)}).collect();`;
    case 'php': return `$pattern = '~${pattern.replace(/~/g, '\\~')}~${flags.includes('i') ? 'i' : ''};\n$subject = ${jsString(subject)};\npreg_match_all($pattern, $subject, $matches);`;
    case 'java': return `Pattern pattern = Pattern.compile(${jsString(pattern)});\nMatcher matcher = pattern.matcher(${jsString(subject)});`;
    case 'csharp': return `var pattern = new Regex(${jsString(pattern)});\nvar matches = pattern.Matches(${jsString(subject)});`;
    case 'ruby': return `pattern = Regexp.new(${jsString(pattern)})\nmatches = ${jsString(subject)}.scan(pattern)`;
  }
};
