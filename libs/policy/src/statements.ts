export const statements = {
  team: ['read', 'create', 'update', 'delete'],
  campus: ['readAll'],
  schoolAccount: ['read', 'update'],
  organization: ['update', 'delete'],
  student: ['create', 'read', 'readOwn', 'update', 'archive', 'markAway'],
  enrollment: ['create', 'read', 'place'],
  guardian: ['create', 'read', 'update', 'link'],
  session: ['create', 'read', 'update', 'setCurrent'],
  class: ['create', 'read', 'readAll', 'update', 'assignTeacher'],
  feeLine: ['create', 'read', 'readOwn', 'update', 'retire'],
  invoice: ['bill', 'charge', 'read', 'readOwn'],
  payment: ['record', 'read', 'readOwn', 'void'],
  adjustment: ['create', 'read', 'approve'],
  announcement: ['create', 'read', 'update'],
  leave: ['approve'],
  ledger: ['read', 'manageAccounts'],
  moneyAccount: ['create', 'read', 'update'],
  store: ['read', 'receive', 'issue', 'count'],
  subject: ['create', 'read', 'update'],
  member: ['create', 'read', 'update', 'delete'],
  ac: ['create', 'read', 'update', 'delete'],
} as const;

export type Statements = typeof statements;
export type Resource = keyof Statements;
export type ActionOf<R extends Resource> = Statements[R][number];
export type Action = ActionOf<Resource>;

export type Permission = {
  [R in Resource]: `${R}:${ActionOf<R>}`;
}[Resource];

export type PermissionMap = Partial<Record<Resource, Action[]>>;

export const RESOURCES = Object.keys(statements) as [Resource, ...Resource[]];

export const ACTIONS = [
  ...new Set(RESOURCES.flatMap((resource) => statements[resource])),
] as [Action, ...Action[]];

export const ALL_PERMISSIONS: readonly Permission[] = RESOURCES.flatMap(
  (resource) =>
    statements[resource].map((action) => `${resource}:${action}` as Permission)
);

export function splitPermission(permission: Permission): [Resource, Action] {
  const [resource = '', action = ''] = permission.split(':');
  return [resource as Resource, action as Action];
}

export const SENSITIVE: readonly Permission[] = [
  'campus:readAll',
  'member:create',
  'member:delete',
  'ac:create',
  'ac:update',
  'ac:delete',
  'organization:update',
  'organization:delete',
  'ledger:manageAccounts',
];

export const PERM_HELP: Partial<Record<Permission, string>> = {
  'campus:readAll':
    'Sees every campus. Without it a member sees only the campuses they belong to.',
  'member:create': 'Adds people to the school. Owner-only by default.',
  'member:update':
    'Gives people roles, but only roles whose permissions they hold too.',
  'ac:create': 'Creates roles, using only what they can do themselves.',
  'organization:update':
    'Hands the school over to another owner. Only an owner can do it.',
  'organization:delete':
    'Deletes the school when it has no students. Only an owner can do it.',
  'session:setCurrent': 'Chooses which term is current.',
  'class:readAll':
    'Sees every class. Without it a member with class access sees only the classes they teach.',
  'class:assignTeacher': 'Names the class teachers of a class.',
  'guardian:create': 'Adds new guardians, with a portal login for each.',
  'guardian:link': 'Links guardians to students and changes who pays the fees.',
  'student:archive':
    'Records students leaving or graduating, and undoes it in the same term.',
  'student:markAway':
    'Marks students not seen since a date, and back in school.',
  'student:readOwn':
    'Students see their own records. Guardians see their own children.',
  'ledger:read': 'Sees the money categories and the journal.',
  'ledger:manageAccounts':
    'Adds fee categories and loads opening balances into the books.',
  'moneyAccount:create':
    'Adds bank, POS and cash accounts. A school-wide account needs every campus.',
  'moneyAccount:read':
    'Sees money accounts. School-wide accounts need every campus.',
  'feeLine:read': 'Sees what each class level pays, and the fee types.',
  'feeLine:create':
    'Adds fees and fee types. A fee for every campus needs every campus.',
  'feeLine:update':
    'Changes a fee amount and sets which students take optional fees.',
  'feeLine:retire': 'Retires a fee. A fee for every campus needs every campus.',
  'subject:create': 'Adds subjects to the school. A code never changes.',
  'subject:update':
    'Renames, retires and restores subjects, sets each level’s subjects and chooses elective students.',
  'invoice:bill':
    'Prepares, sends and cancels rounds of student charges, on the campuses they see.',
  'invoice:charge':
    "Adds one-off charges to a student's account, on the campuses they see.",
  'invoice:read': 'Sees rounds and charges, and what each one posted.',
  'invoice:readOwn':
    'Students see their own charges. Guardians see their children’s.',
  'payment:record':
    'Records cash, transfer and POS payments and issues receipts, on the campuses they see.',
  'payment:read': 'Sees payments and receipts, and who owes what.',
  'payment:readOwn':
    'Students see their own payments. Guardians see their children’s.',
  'payment:void':
    'Asks for a recorded payment to be cancelled. A second person approves it.',
  'adjustment:create':
    'Asks for a refund, a fee reduction, a cancelled balance or a discount. A second person approves it.',
  'adjustment:read':
    'Sees refunds, corrections, discounts and cancelled payments.',
  'adjustment:approve':
    'Approves or declines money requests from other people, never their own.',
  'leave:approve':
    'Approves or declines staff leave requests from other people, never their own.',
  'store:read':
    'Sees the store: items, stock on hand and deliveries, on the campuses they see.',
  'store:receive':
    'Adds items, edits prices and records deliveries and opening stock, on the campuses they see.',
  'store:issue':
    'Records student purchases at the store, on the campuses they see.',
  'store:count':
    'Counts store stock and submits the differences for approval, on the campuses they see.',
};

const RESOURCE_LABELS: Record<Resource, string> = {
  team: 'Campuses',
  campus: 'Campus reach',
  schoolAccount: 'School settings',
  organization: 'School',
  student: 'Students',
  enrollment: 'Enrolment',
  guardian: 'Guardians',
  session: 'School years and terms',
  class: 'Classes',
  feeLine: 'School and other fees',
  invoice: 'Charges',
  payment: 'Payments',
  adjustment: 'Discounts and refunds',
  announcement: 'Announcements',
  leave: 'Staff leave',
  ledger: 'Money categories',
  moneyAccount: 'Bank and POS accounts',
  store: 'Store',
  subject: 'Subjects',
  member: 'Staff',
  ac: 'Roles',
};

export const resourceLabel = (resource: Resource): string =>
  RESOURCE_LABELS[resource];

export function permLabel(permission: Permission): string {
  const [resource, action] = splitPermission(permission);
  const words = action.replaceAll(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return `${RESOURCE_LABELS[resource]}: ${words}`;
}
