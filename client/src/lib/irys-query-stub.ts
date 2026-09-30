/**
 * Build-time stub for `@irys/query` (devnet Irys SDK pulls Node streams
 * through it). We only fund+upload, never query, so an empty default
 * export keeps the browser bundle free of Node polyfills.
 */
export default class IrysQueryStub {
  constructor(_opts?: unknown) {
    void _opts;
  }
}
