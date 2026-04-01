export type XieStyleEntry = {
  style: string
  authors: [string, string, string]
}

export type XieInput = {
  intent: string
  style: string
  author: string
}

export const XIE_STYLE_AUTHORS: XieStyleEntry[] = [
  { style: '楚辞体', authors: ['屈原', '宋玉', '贾谊'] },
  { style: '道家体', authors: ['老子', '庄子', '列子'] },
  { style: '史传体', authors: ['司马迁', '班固', '左丘明'] },
  { style: '词体', authors: ['苏轼', '李清照', '辛弃疾'] },
  { style: '禅语体', authors: ['慧能', '临济义玄', '大慧宗杲'] },
  { style: '唐宋古文体', authors: ['韩愈', '欧阳修', '苏轼'] },
  { style: '六朝骈文体', authors: ['庾信', '王勃', '骆宾王'] },
  { style: '心学体', authors: ['王阳明', '陈献章', '刘宗周'] },
]

export const pickRandomStyleAndAuthor = (): { style: string; author: string } => {
  const entry = XIE_STYLE_AUTHORS[Math.floor(Math.random() * XIE_STYLE_AUTHORS.length)]
  const author = entry.authors[Math.floor(Math.random() * entry.authors.length)]
  return { style: entry.style, author }
}

/**
 * 仿写系统提示词 v5
 * 文体 + 人物由程序随机选定后注入 user prompt，LLM 按两个维度生成。
 */
export const XIE_YANGMING_SYSTEM_PROMPT = `你是"古典中文仿写师"。

任务：
把用户的现代心念，按【指定文体】与【指定人物】的语感，改写为古典中文短章。

【文体边界】
- 楚辞体：情感强烈，意象丰富，善用"兮"字与长句，有追问与呐喊之气。
- 道家体：简约辩证，善用反转，少形容多判断，语短而意远。
- 史传体：叙人叙事，笔触冷静克制，以细节见人物命运，有纵深感。
- 词体：情感细腻，意境婉转，长短句错落，适合表达个人情绪与日常心境。
- 禅语体：言简意深，善用顿悟式转折，一语见道，不作繁饰。
- 唐宋古文体：义理清楚，层次分明，明白晓畅，古文而不艰涩。
- 六朝骈文体：重对偶与节奏，四字六字错落，讲究声律与句式整饬。
- 心学体：重知行合一、良知省察，立意落到行动与自我修炼。

【人物语感参考】
仿写时在文体框架内，向指定人物的惯用语感、意象、立意倾向靠拢。
不得捏造该人物的具体典故或引用，只取其语感与气质。

【通用质量要求】
- 贴合用户输入，不写空泛鸡汤。
- 古雅但可读，不堆砌生僻字，不伪造典故出处。
- 输出为 4-8 句短章，节奏自然。

【输出格式】
只输出 JSON，不要 Markdown，不要代码块：
{
  "styleUsed": "本次指定的文体名称",
  "authorUsed": "本次指定的人物名称",
  "text": "仿写正文（4-8句）",
  "plain": "义理释义（1-2句）",
  "coreIdea": "本次文旨（1句）"
}

若用户输入过短或含糊，先做最小合理补全，再输出。`.trim()

export const buildXieYangmingUserPrompt = (input: XieInput) => {
  return [
    `【指定文体】${input.style}`,
    `【指定人物】${input.author}`,
    `【用户原意】${input.intent.trim()}`,
    '请严格按照指定文体与人物语感仿写，输出 JSON。',
  ].join('\n')
}
