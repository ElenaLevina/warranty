/** Параметры маршрутов корневого стека (4 экрана из ТЗ §3). */
export type RootStackParamList = {
  Start: undefined;
  PlateCapture: undefined;
  ActiveSession: { caseId: string };
  SessionComplete: { plate: string; photoCount: number; videoCount: number };
};
