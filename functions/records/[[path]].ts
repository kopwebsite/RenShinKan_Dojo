import { withPrivateNoIndex } from "../_lib/privateResponse";

export const onRequestGet: PagesFunction = async ({ next }) => withPrivateNoIndex(await next());
