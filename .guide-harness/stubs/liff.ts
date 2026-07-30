// Stand-in for @line/liff, used only by the screenshot harness that renders
// the real app for the tutorial guides. Nothing here ships.

const liff = {
  init: () => Promise.resolve(),
  isInClient: () => true,
  getOS: () => 'ios',
  getIDToken: () => 'harness-id-token',
  getDecodedIDToken: () => ({ sub: 'Uharnessharnessharnessharness0001' }),
  login: () => undefined,
  isLoggedIn: () => true,
};

export default liff;
