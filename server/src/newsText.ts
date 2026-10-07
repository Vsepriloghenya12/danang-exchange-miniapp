// Remove the source channel's standalone footer, never dates inside the actual story.
export function cleanNewsText(text: string): string {
  return text.split(/\r?\n/).filter(line => !/^\s*(?:🌴\s*)?Новости\s+Дананга\s*[.!]?\s*$/iu.test(line)).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
export function newsLanguage(text: string): 'ru' | 'vi' | 'en' {
  if (/[а-яё]/i.test(text)) return 'ru';
  return /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉĩịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/iu.test(text) ? 'vi' : 'en';
}
