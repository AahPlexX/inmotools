// Feature (Markdown completion) — `:shortcode:` emoji.
//
// A curated map rather than a new emoji-shortcode dependency: none exists
// even transitively in this project (checked), and pulling one in for this
// alone would be a large addition for a small, well-bounded feature. Covers
// the shortcodes people actually type day to day; an unrecognized shortcode
// is left exactly as written rather than guessed at, matching the same
// leave-it-alone-if-unsure convention as code-highlight-engine.ts's
// unrecognized fence languages.
//
// Runs as a remark (mdast) text-node transform, so it only ever touches
// prose text nodes - inline code, fenced code, and link/image destinations
// are separate node types in the tree and are never visited.

import { visit } from 'unist-util-visit';
import type { Root, Text } from 'mdast';
import type { Plugin } from 'unified';

export const EMOJI_SHORTCODES: Readonly<Record<string, string>> = {
  smile: '😄', smiley: '😃', grin: '😁', laughing: '😆', satisfied: '😆',
  sweat_smile: '😅', joy: '😂', rofl: '🤣', relaxed: '☺️', blush: '😊',
  innocent: '😇', slight_smile: '🙂', upside_down: '🙃', wink: '😉',
  relieved: '😌', heart_eyes: '😍', kissing_heart: '😘', kissing: '😗',
  yum: '😋', stuck_out_tongue: '😛', stuck_out_tongue_winking_eye: '😜',
  stuck_out_tongue_closed_eyes: '😝', money_mouth: '🤑', hugs: '🤗',
  thinking: '🤔', neutral_face: '😐', expressionless: '😑', no_mouth: '😶',
  rolling_eyes: '🙄', smirk: '😏', persevere: '😣', disappointed_relieved: '😥',
  open_mouth: '😮', zipper_mouth: '🤐', hushed: '😯', sleepy: '😪',
  tired_face: '😫', sleeping: '😴', mask: '😷', thermometer_face: '🤒',
  head_bandage: '🤕', nauseated: '🤢', vomiting: '🤮', sneezing: '🤧',
  dizzy_face: '😵', cowboy: '🤠', sunglasses: '😎', nerd: '🤓', confused: '😕',
  worried: '😟', slight_frown: '🙁', frowning: '😦', frowning_face: '😦',
  open_mouth_frown: '😧', weary: '😩', triumph: '😤', angry: '😠', rage: '😡',
  cry: '😢', sob: '😭', fearful: '😨', cold_sweat: '😰', scream: '😱',
  astonished: '😲', flushed: '😳', pensive: '😔', sad: '😔', grimacing: '😬',
  unamused: '😒', roll_eyes: '🙄', confounded: '😖', anguished: '😧',
  disappointed: '😞', sweat: '😓', broken_heart: '💔', heart: '❤️',
  orange_heart: '🧡', yellow_heart: '💛', green_heart: '💚', blue_heart: '💙',
  purple_heart: '💜', black_heart: '🖤', white_heart: '🤍', brown_heart: '🤎',
  two_hearts: '💕', sparkling_heart: '💖', heartpulse: '💗', heartbeat: '💓',
  revolving_hearts: '💞', cupid: '💘', gift_heart: '💝', sparkles: '✨',
  star: '⭐', star2: '🌟', boom: '💥', fire: '🔥', collision: '💥',
  100: '💯', tada: '🎉', confetti_ball: '🎊', balloon: '🎈', gift: '🎁',
  thumbsup: '👍', '+1': '👍', thumbsdown: '👎', '-1': '👎', clap: '👏',
  raised_hands: '🙌', pray: '🙏', wave: '👋', ok_hand: '👌', muscle: '💪',
  point_up: '☝️', point_down: '👇', point_left: '👈', point_right: '👉',
  fist: '✊', punch: '👊', v: '✌️', crossed_fingers: '🤞', handshake: '🤝',
  eyes: '👀', eye: '👁️', brain: '🧠', speech_balloon: '💬', thought_balloon: '💭',
  zzz: '💤', bulb: '💡', warning: '⚠️', bangbang: '‼️', question: '❓',
  exclamation: '❗', white_check_mark: '✅', heavy_check_mark: '✔️',
  x: '❌', no_entry: '⛔', rocket: '🚀', checkered_flag: '🏁', trophy: '🏆',
  medal: '🏅', memo: '📝', pencil2: '✏️', bookmark: '🔖', book: '📖',
  books: '📚', wrench: '🔧', hammer: '🔨', gear: '⚙️', lock: '🔒',
  unlock: '🔓', key: '🔑', mag: '🔍', link: '🔗', paperclip: '📎',
  calendar: '📅', clock: '🕐', hourglass: '⏳', stopwatch: '⏱️', alarm_clock: '⏰',
  email: '📧', envelope: '✉️', inbox_tray: '📥', outbox_tray: '📤',
  computer: '💻', desktop: '🖥️', keyboard: '⌨️', printer: '🖨️', phone: '📱',
  bug: '🐛', beetle: '🪲', ant: '🐜', spider: '🕷️',
  coffee: '☕', tea: '🍵', pizza: '🍕', hamburger: '🍔', beer: '🍺',
  sun: '☀️', cloud: '☁️', rainbow: '🌈', snowflake: '❄️', zap: '⚡',
  earth_americas: '🌎', globe_with_meridians: '🌐', new: '🆕', ok: '🆗',
  up: '🆙', soon: '🔜', back: '🔙', top: '🔝', recycle: '♻️',
};

const SHORTCODE = /:([a-z0-9_+-]+):/gi;

const remarkEmoji: Plugin<[], Root> = () => (tree) => {
  visit(tree, 'text', (node: Text) => {
    node.value = node.value.replace(SHORTCODE, (match, name: string) => EMOJI_SHORTCODES[name.toLowerCase()] ?? match);
  });
};

export default remarkEmoji;
