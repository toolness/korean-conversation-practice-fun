/** Vocabulary pools extracted from Active Korean workbook series. */

// Unit 2 — Greetings & Introductions

export const COUNTRIES: [string, string][] = [
  ["미국", "the United States"],
  ["중국", "China"],
  ["일본", "Japan"],
  ["인도", "India"],
  ["호주", "Australia"],
  ["영국", "the United Kingdom"],
  ["독일", "Germany"],
  ["프랑스", "France"],
  ["캐나다", "Canada"],
  ["한국", "Korea"],
  ["러시아", "Russia"],
];

export const OCCUPATIONS: [string, string][] = [
  ["선생님", "teacher"],
  ["학생", "student"],
  ["의사", "doctor"],
  ["요리사", "chef"],
  ["은행원", "bank clerk"],
  ["기자", "reporter"],
  ["회사원", "company employee"],
  ["연구원", "researcher"],
];

// Unit 3 — Restaurant

export const FOOD: [string, string][] = [
  ["불고기", "bulgogi"],
  ["냉면", "naengmyeon"],
  ["비빔밥", "bibimbap"],
  ["라면", "ramen"],
  ["김밥", "gimbap"],
];

export const DRINKS: [string, string][] = [
  ["우유", "milk"],
  ["콜라", "cola"],
  ["맥주", "beer"],
  ["물", "water"],
  ["커피", "coffee"],
  ["주스", "juice"],
];

// Korean names for role assignment

export const KOREAN_NAMES = [
  "재민", "소피아", "선우", "피터", "애니",
  "유진", "하나", "민수", "지현", "준호",
];

// Unit 9 — Phone Call

/** [dict form, progressive form, English] */
export const PHONE_ACTIVITIES: [string, string, string][] = [
  ["자다", "자고 있어요", "sleeping"],
  ["샤워하다", "샤워하고 있어요", "showering"],
  ["공부하다", "공부하고 있어요", "studying"],
  ["운동하다", "운동하고 있어요", "exercising"],
  ["회의하다", "회의하고 있어요", "in a meeting"],
  ["노래하다", "노래하고 있어요", "singing"],
];

export const UNIT9_VERBS: [string, string][] = [
  ["바꾸다", "to change"],
  ["받다", "to receive / to take / to get"],
  ["전화하다", "to call"],
];

export const UNIT9_NOUNS: [string, string][] = [
  ["케이크", "cake"],
  ["음식", "food"],
  ["저녁", "evening"],
];

export const UNIT9_OTHERS: [string, string][] = [
  ["아직", "(not) yet, still"],
  ["빨리", "quickly"],
];

export const UNIT9_PHRASES: [string, string][] = [
  ["전화를 받다", "to get (answer) the telephone"],
  ["여보세요", "hello (on phone)"],
  ["실례지만", "excuse me, but"],
  ["누구세요", "who is this?"],
  ["잠깐만 기다리세요", "please wait a moment"],
  ["안녕히 계세요", "goodbye (to person staying)"],
  ["알겠습니다", "I understand"],
];

// Book 2 Unit 2 — Transportation / Directions

export const BOOK2_UNIT2_TRANSPORT: [string, string][] = [
  ["지하철", "subway"],
  ["버스", "bus"],
  ["택시", "taxi"],
  ["기차", "train"],
  ["비행기", "airplane"],
];

export const BOOK2_UNIT2_VERBS: [string, string][] = [
  ["타다", "to get on / to ride"],
  ["내리다", "to get off"],
  ["갈아타다", "to transfer"],
  ["걷다", "to walk"],
  ["걸리다", "to take (time)"],
];

export const BOOK2_UNIT2_OTHERS: [string, string][] = [
  ["호선", "subway line number"],
  ["번", "counting unit after a number"],
  ["분", "minute(s)"],
  ["쯤", "about / around"],
  ["어떻게", "how"],
  ["얼마나", "how long / how much"],
  ["여기에서", "from here"],
  ["같이", "together"],
];

export const BOOK2_UNIT2_PHRASES: [string, string][] = [
  ["어떻게 가요?", "How do I get there?"],
  ["얼마나 걸려요?", "How long does it take?"],
  ["몇 번 버스를 타야 돼요?", "What number bus should I take?"],
  ["몇 호선을 타야 돼요?", "Which subway line should I take?"],
  ["걸어서 가요", "go on foot"],
  ["알겠습니다", "I understand"],
];

/** Famous Seoul destinations the asker might be trying to reach. */
export const BOOK2_UNIT2_PLACES: [string, string][] = [
  ["남대문시장", "Namdaemun Market"],
  ["인사동", "Insa-dong"],
  ["명동", "Myeong-dong"],
  ["코엑스몰", "Coex Mall"],
  ["롯데월드", "Lotte World"],
  ["예술의 전당", "Seoul Arts Center"],
];

/** Stations used as get-off points or transfer hubs. */
export const BOOK2_UNIT2_STATIONS: [string, string][] = [
  ["회현역", "Hoehyeon Station"],
  ["시청역", "City Hall Station"],
  ["안국역", "Anguk Station"],
  ["교대역", "Seoul Nat'l Univ. of Education Station"],
  ["삼성역", "Samseong Station"],
  ["잠실역", "Jamsil Station"],
  ["사당역", "Sadang Station"],
  ["명동역", "Myeongdong Station"],
];

/** Sino-Korean numerals 1–9, used for bus numbers and subway line numbers. */
export const SINO_NUMBERS_1_TO_9: [number, string][] = [
  [1, "일"],
  [2, "이"],
  [3, "삼"],
  [4, "사"],
  [5, "오"],
  [6, "육"],
  [7, "칠"],
  [8, "팔"],
  [9, "구"],
];
