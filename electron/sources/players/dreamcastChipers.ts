// Собственный плеер dreamerscast.com — единственный из всех портированных
// плееров, где видео не отдаётся напрямую и не через понятный API, а через
// многослойную обфускацию прямо в JS-бандле страницы:
//   1. JS-бандл плеера запакован Dean-Edwards-style packer'ом
//      (`eval(function(p,a,c,k,e,d){...}('...',36,N,'...'.split('|')))`) —
//      его нужно сначала распаковать.
//   2. Внутри распакованного скрипта лежит "crypt-код" — строка вида
//      `#1....==\\` или `#0....==`, где префикс определяет, каким путём её
//      расшифровывать (Salt-base64-вариант напрямую, либо сперва через
//      Caesar-подобный "перец/сахар"-шифр).
//   3. Расшифрованный crypt-код — JSON-словарь с ключами bk0..bk4: это
//      "соль", которую нужно вырезать из закодированного блока плейлиста
//      страницы (`new Playerjs("...")`), прежде чем его можно будет
//      base64-декодировать и распарсить как JSON.
// Разобрано по актуальным исходникам anicli_api как справочнику (авторство
// оригинального декодера — https://github.com/barsikus007, ссылка есть прямо
// в docstring исходника):
//   https://github.com/vypivshiy/anicli-api/blob/master/anicli_api/player/dreamcast_chipers.py
// Портировано максимально дословно (включая пару неочевидных мест вроде
// потери последнего символа при разборе k-массива packer'а — это не баг
// порта, а точное повторение оригинального регэкспа) и проверено на реальных
// данных: рядом написан отдельный Python-скрипт (тоже дословная копия
// исходников anicli_api), прогнанный на реально скачанных playerjs.min.js и
// HTML-странице аниме — оба вывода (эталонный Python и этот TS) должны
// совпадать. Итоговая HLS-ссылка подтверждена как реально играбельная через
// yt-dlp (протокол m3u8_native).

export interface DreamcastFileItem {
  label: string
  title: string
  file: string
  thumbnails: string
  embed: string
  id: string
  vars: Record<string, string>
}

export interface DreamcastPlaylist {
  id: string
  file: DreamcastFileItem[]
}

const ABC = 'ABCDEFGHIJKLMabcdefghijklmNOPQRSTUVWXYZnopqrstuvwxyz'
const SALT_ABC_STRING = `${ABC}0123456789+/=`
const O_Y = 'xx???x=xx?x??='
const BASE36_STRING = '0123456789abcdefghijklmnopqrstuvwxyz'

const PARAMS_START = "return p}('"
const PARAMS_PACKED_OFFSET = PARAMS_START.length - 1

interface PackedParams {
  p: string
  a: number
  c: number
  k: string[]
}

function parseParamsToUnpack(packed: string): PackedParams {
  const startIndex = packed.indexOf(PARAMS_START)
  if (startIndex === -1) {
    throw new Error('Dreamcast: не найден маркер packer-а в JS плеера (сайт мог измениться)')
  }
  let rest = packed.slice(startIndex + PARAMS_PACKED_OFFSET, -1)

  const pMatch = rest.match(/'(.*[^\\])',/)
  if (!pMatch) {
    throw new Error('Dreamcast: не удалось разобрать packer (аргумент p)')
  }
  const p = pMatch[1]
  const pStart = (pMatch.index ?? 0) + 1
  rest = rest.slice(pStart + p.length + 2)

  const aMatch = rest.match(/(\d+),/)
  if (!aMatch) {
    throw new Error('Dreamcast: не удалось разобрать packer (аргумент a)')
  }
  const a = Number(aMatch[1])
  rest = rest.slice((aMatch.index ?? 0) + aMatch[1].length + 1)

  const cMatch = rest.match(/(\d+),/)
  if (!cMatch) {
    throw new Error('Dreamcast: не удалось разобрать packer (аргумент c)')
  }
  const c = Number(cMatch[1])
  rest = rest.slice((cMatch.index ?? 0) + cMatch[1].length + 1)

  const kMatch = rest.match(/'(.*)[^\\]'\.split/)
  if (!kMatch) {
    throw new Error('Dreamcast: не удалось разобрать packer (аргумент k)')
  }
  const k = kMatch[1].split('|')

  return { p, a, c, k }
}

function unpackPlayerjs({ p, a, c, k }: PackedParams): string {
  const dict: Record<string, string> = {}

  function e(num: number): string {
    const left = num < a ? '' : e(Math.floor(num / a))
    const remainder = num % a
    const right =
      remainder > 35 ? String.fromCharCode(remainder + 29) : BASE36_STRING[remainder]
    return left + right
  }

  let count = c
  while (count) {
    count -= 1
    dict[e(count)] = k[count] || e(count)
  }

  return p.replace(/\b\w+\b/g, (token) => dict[token] ?? token)
}

function getCryptCode(playerJsPackedResponse: string): string {
  const params = parseParamsToUnpack(playerJsPackedResponse)
  const script = unpackPlayerjs(params)
  const match = script.match(/u:\s*\\\s*['"]([^=]+=[\\]+)\s*['"]/)
  if (!match) {
    throw new Error('Dreamcast: не найден crypt-код в распакованном плеере (сайт мог измениться)')
  }
  return match[1]
}

function saltUtfDecode(e: string): string {
  let t = ''
  let n = 0
  while (n < e.length) {
    const r = e.charCodeAt(n)
    if (r < 128) {
      t += String.fromCharCode(r)
      n += 1
    } else if (r > 191 && r < 224) {
      const c2 = e.charCodeAt(n + 1)
      t += String.fromCharCode(((r & 31) << 6) | (c2 & 63))
      n += 2
    } else {
      const c2 = e.charCodeAt(n + 1)
      const c3 = e.charCodeAt(n + 2)
      t += String.fromCharCode(((r & 15) << 12) | ((c2 & 63) << 6) | (c3 & 63))
      n += 3
    }
  }
  return t
}

function saltDecode(e: string): string {
  const filtered = Array.from(e)
    .filter((ch) => SALT_ABC_STRING.includes(ch))
    .join('')

  let t = ''
  let f = 0
  while (f < filtered.length) {
    const s = SALT_ABC_STRING.indexOf(filtered[f])
    f += 1
    const o = SALT_ABC_STRING.indexOf(filtered[f])
    f += 1
    const u = SALT_ABC_STRING.indexOf(filtered[f])
    f += 1
    const a = SALT_ABC_STRING.indexOf(filtered[f])
    f += 1

    const n = (s << 2) | (o >> 4)
    const r = ((o & 15) << 4) | (u >> 2)
    const i = ((u & 3) << 6) | a

    t += String.fromCharCode(n)
    if (u !== 64) t += String.fromCharCode(r)
    if (a !== 64) t += String.fromCharCode(i)
  }

  return saltUtfDecode(t)
}

function sugar(x: string): number {
  const parts = x.split('=')
  let result = ''
  for (const item of parts) {
    let encoded = ''
    for (const ch of item) encoded += ch === 'x' ? '1' : '0'
    const value = encoded.length ? parseInt(encoded, 2) : 0
    result += String.fromCharCode(value)
  }
  return parseInt(result.slice(0, -1), 10)
}

function pepper(s: string, n: number): string {
  const normalized = s.replaceAll('+', '#').replaceAll('#', '+')
  let a = sugar(O_Y) * n
  if (n < 0) a += ABC.length / 2
  const shift = Math.trunc(a * 2)
  const r = ABC.slice(shift) + ABC.slice(0, shift)
  return normalized.replace(/[A-Za-z]/g, (ch) => r[ABC.indexOf(ch)])
}

function decode(x: string): string {
  if (x.slice(0, 2) === '#1') {
    return saltDecode(pepper(x.slice(2), -1))
  }
  if (x.slice(0, 2) === '#0') {
    return saltDecode(x.slice(2))
  }
  return x
}

// urllib.parse.quote(s) по умолчанию (safe='/') — не то же самое, что
// encodeURIComponent (тот дополнительно экранирует "/" и не экранирует
// "!'()*"). Токены bk0..bk4 ищутся как подстрока внутри уже готового
// закодированного блока страницы, так что кодирование обязано побайтово
// совпадать с тем, что использует сам сайт (подтверждено эталонным Python).
function pythonQuote(s: string): string {
  const bytes = Buffer.from(s, 'utf-8')
  let out = ''
  for (const byte of bytes) {
    const ch = String.fromCharCode(byte)
    if (byte < 128 && /[A-Za-z0-9_.\-~/]/.test(ch)) {
      out += ch
    } else {
      out += `%${byte.toString(16).toUpperCase().padStart(2, '0')}`
    }
  }
  return out
}

function b64EncodeUrlParams(s: string): string {
  return Buffer.from(pythonQuote(s)).toString('base64')
}

function b64DecodeUrlParams(s: string): string {
  return decodeURIComponent(Buffer.from(s, 'base64').toString('utf-8'))
}

export function extractPlaylist(
  playerJsPackedResponse: string,
  playerEncoded: string,
): DreamcastPlaylist {
  const cryptCode = getCryptCode(playerJsPackedResponse)
  const decodedCrypt = decode(cryptCode)

  let v: Record<string, string>
  try {
    v = JSON.parse(decodedCrypt) as Record<string, string>
  } catch {
    throw new Error('Dreamcast: не удалось разобрать расшифрованный crypt-код как JSON')
  }

  const fileSeparator = '//'
  let a = playerEncoded.slice(2)

  for (let i = 4; i >= 0; i -= 1) {
    const result = v[`bk${i}`]
    if (result && result !== 'undefined') {
      const token = fileSeparator + b64EncodeUrlParams(result)
      a = a.split(token).join('')
    }
  }

  try {
    return JSON.parse(b64DecodeUrlParams(a)) as DreamcastPlaylist
  } catch {
    throw new Error('Dreamcast: не удалось разобрать плейлист после декодирования')
  }
}
