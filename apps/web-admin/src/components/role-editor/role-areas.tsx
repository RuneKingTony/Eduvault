import {
  CAP_AREAS,
  applyAreaLevel,
  capLevel,
  holds,
  toPermissions,
  toPermissionMap,
  type AreaLevel,
  type CapArea,
  type CapExtra,
  type Permission,
  type PermissionMap,
} from '@eduvault/policy';
import { Badge, Label, RadioGroup, RadioGroupItem, Switch } from '@eduvault/ui';
import { WithTooltip } from '../member-roles';

const CANT_GIVE = 'You can’t give access you don’t have yourself';

const LEVELS: readonly { level: AreaLevel; label: string }[] = [
  { level: 'none', label: 'No access' },
  { level: 'see', label: 'Can see' },
  { level: 'change', label: 'Can change' },
];

export interface AreaChange {
  permissions: PermissionMap;
  leftOut: readonly Permission[];
}

interface RoleAreasProps {
  permissions: PermissionMap;
  editorMap: PermissionMap;
  readOnly: boolean;
  onChange: (change: AreaChange) => void;
}

export function ImportantDot() {
  return (
    <span
      role="img"
      aria-label="Important"
      className="inline-block size-2 shrink-0 rounded-full bg-warning"
    />
  );
}

function areaLine(area: CapArea, level: ReturnType<typeof capLevel>): string {
  switch (level) {
    case 'change': {
      return area.changeDesc;
    }
    case 'see': {
      return 'Can look but not change anything';
    }
    case 'custom': {
      return 'Some permissions are set by hand';
    }
    case 'none': {
      return 'Can’t open this part of the app';
    }
  }
}

function LevelPicker({
  area,
  permissions,
  editorMap,
  readOnly,
  onChange,
}: RoleAreasProps & { area: CapArea }) {
  const level = capLevel(permissions, area);
  return (
    <RadioGroup
      aria-label={`${area.label} access`}
      className="flex w-auto flex-wrap gap-x-4 gap-y-1"
      value={level === 'custom' ? '' : level}
      disabled={readOnly}
      onValueChange={(next) => {
        const picked = LEVELS.find((entry) => entry.level === next)?.level;
        if (picked === undefined) {
          return;
        }
        const applied = applyAreaLevel({
          map: permissions,
          area,
          level: picked,
          editorMap,
        });
        onChange({ permissions: applied.map, leftOut: applied.leftOut });
      }}
    >
      {LEVELS.map((entry) => {
        const unheld =
          applyAreaLevel({
            map: permissions,
            area,
            level: entry.level,
            editorMap,
          }).leftOut.length > 0;
        const id = `area-${area.id}-${entry.level}`;
        return (
          <WithTooltip key={entry.level} text={unheld ? CANT_GIVE : undefined}>
            <div className="flex items-center gap-1.5">
              <RadioGroupItem
                id={id}
                value={entry.level}
                disabled={readOnly || unheld}
              />
              <Label htmlFor={id} className="font-normal">
                {entry.label}
              </Label>
            </div>
          </WithTooltip>
        );
      })}
    </RadioGroup>
  );
}

function setExtra(
  permissions: PermissionMap,
  extra: CapExtra,
  on: boolean
): PermissionMap {
  const current = toPermissions(permissions).filter(
    (permission) => !extra.permissions.includes(permission)
  );
  return toPermissionMap(on ? [...current, ...extra.permissions] : current);
}

function ExtraSwitch({
  extra,
  permissions,
  editorMap,
  readOnly,
  onChange,
}: RoleAreasProps & { extra: CapExtra }) {
  const id = `extra-${extra.permissions.join('-')}`;
  const on = extra.permissions.every((permission) =>
    holds(permissions, permission)
  );
  const unheld = extra.permissions.some(
    (permission) => !holds(editorMap, permission)
  );
  return (
    <div className="flex items-start gap-2">
      <WithTooltip text={unheld ? CANT_GIVE : undefined}>
        <Switch
          id={id}
          size="sm"
          checked={on}
          disabled={readOnly || unheld}
          onCheckedChange={(next) => {
            onChange({
              permissions: setExtra(permissions, extra, next),
              leftOut: [],
            });
          }}
        />
      </WithTooltip>
      <div className="flex flex-col">
        <Label htmlFor={id} className="gap-1.5 font-normal">
          {extra.label}
          {extra.important ? <ImportantDot /> : null}
        </Label>
        <p className="text-xs text-muted-foreground">{extra.description}</p>
      </div>
    </div>
  );
}

function AreaRow({ area, ...props }: RoleAreasProps & { area: CapArea }) {
  const level = capLevel(props.permissions, area);
  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-medium">
          {area.label}
          {area.important ? <ImportantDot /> : null}
          {level === 'custom' ? (
            <WithTooltip text="Set by hand under Advanced. Pick a level to tidy it up.">
              <Badge variant="warning">Custom</Badge>
            </WithTooltip>
          ) : null}
        </span>
        <LevelPicker area={area} {...props} />
      </div>
      <p className="text-sm text-muted-foreground">{areaLine(area, level)}</p>
      {area.extras.map((extra) => (
        <ExtraSwitch key={extra.label} extra={extra} {...props} />
      ))}
    </li>
  );
}

export function RoleAreas(props: RoleAreasProps) {
  const groups = [...new Set(CAP_AREAS.map((area) => area.group))];
  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <section key={group} aria-label={group} className="flex flex-col">
          <h3 className="text-sm font-medium text-muted-foreground">{group}</h3>
          <ul className="divide-y">
            {CAP_AREAS.filter((area) => area.group === group).map((area) => (
              <AreaRow key={area.id} area={area} {...props} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
