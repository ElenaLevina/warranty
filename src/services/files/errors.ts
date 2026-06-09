/** Бросается при попытке записи в закрытый (READ ONLY) кейс. */
export class SessionClosedError extends Error {
  constructor(public readonly plateNumber: string, public readonly action: string) {
    super(`Кейс ${plateNumber} закрыт (READ ONLY). Операция «${action}» запрещена.`);
    this.name = 'SessionClosedError';
  }
}

/** Бросается при попытке создать кейс, который уже закрыт. */
export class CaseAlreadyClosedError extends Error {
  constructor(public readonly plateNumber: string) {
    super(`Кейс ${plateNumber} уже завершён и не может быть переоткрыт.`);
    this.name = 'CaseAlreadyClosedError';
  }
}
