export type AwaitedReturn<T extends (...arguments_: never[]) => unknown> = Awaited<ReturnType<T>>;
