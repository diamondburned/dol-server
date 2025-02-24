// JavaScript source code extracted from Degrees of Lewdity's source code
// game/base-system/time/{dateTime,time}.js, then transformed into TypeScript
// using ChatGPT 3.5.
//
// All credits go to the original author(s) of the source code.

export declare class DateTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  timeStamp: number;

  static getTotalDaysSinceStart(year: number): number;
  static isLeapYear(year: number): boolean;
  static getDaysOfMonthFromYear(year: number): number[];
  static getDaysOfYear(year: number): number;

  toTimestamp(
    year: number,
    month: number,
    day: number,
    hour: number,
    minute: number,
    second: number,
  ): void;
  fromTimestamp(timestamp: number): void;

  getFirstWeekdayOfMonth(weekDay: number): DateTime;
  getNextWeekdayDate(weekDay: number): DateTime;
}

export declare class Time {
  date: DateTime;
  holidayMonths: number[];
  second: number;
  minute: number;
  hour: number;
  weekDay: number;
  weekDayName: string;
  monthDay: number;
  month: number;
  monthName: string;
  year: number;
  days: number;
  season: "winter" | "autumn" | "summer" | "spring";
  startDate: DateTime;
  tomorrow: DateTime;
  yesterday: DateTime;
  schoolTerm: boolean;
  schoolDay: boolean;
  schoolTime: boolean;
  dayState: "night" | "dusk" | "day" | "dawn";
  nightState: "morning" | "evening" | undefined;
  nextSchoolTermStartDate: DateTime;
  nextSchoolTermEndDate: DateTime;
  lastDayOfMonth: number;

  set(timeStamp?: number): void;
  setDate(date: DateTime): void;
  setTime(hour: number, minute: number): void;
  setTimeRelative(hour: number, minute: number): void;
  pass(seconds: number): DocumentFragment;
  isSchoolTerm(date: DateTime): boolean;
  isSchoolDay(date: DateTime): boolean;
  isSchoolTime(date: DateTime): boolean;

  secondsPerDay: number;
  secondsPerHour: number;
  secondsPerMinute: number;
  standardYearMonths: number[];
  leapYearMonths: number[];
  monthNames: string[];
  daysOfWeek: string[];

  getNextSchoolTermStartDate(date: DateTime): DateTime;
  getNextSchoolTermEndDate(date: DateTime): DateTime;
  getNextWeekdayDate(weekDay: number): DateTime;
  getPreviousWeekdayDate(weekDay: number): DateTime;
  isWeekEnd(): boolean;
}

declare global {
  interface Window {
    Time: Time;
  }
  const Time: Time;
}
