/** How much of `pathname` the route `root` claims: 0 for no match, else the root's length. */
export function routeMatchLength(root: string, pathname: string): number {
  if (root === '/') {
    return pathname === '/' ? 1 : 0;
  }
  return pathname === root || pathname.startsWith(`${root}/`) ? root.length : 0;
}
