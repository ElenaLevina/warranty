/** Параметры маршрутов корневого стека (4 экрана из ТЗ §3). */
export type RootStackParamList = {
  Start: undefined;
  PlateCapture: undefined;
  ActiveSession: { plate: string };
  SessionComplete: { plate: string; photoCount: number; videoCount: number };
};
