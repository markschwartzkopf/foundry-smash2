export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type TournamentsRep = {
  id: string;
  name: string;
}[];

export type EventsRep = {
  id: string;
  name: string;
}[];

export type SelectedEvent = {
  tournament: number | null;
  event: number | null;
}

declare global {
  interface JSON {
    parse(
      text: string,
      reviver?: (this: any, key: string, value: any) => any
    ): unknown;
  }
}
