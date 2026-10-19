import { BadgeCheckIcon, Building2Icon } from 'lucide-react';
import type { Role } from '@eduvault/api-contract';
import {
  applyRoleTemplate,
  availableRoleTemplates,
  type PermissionMap,
  type RoleTemplate,
} from '@eduvault/policy';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  toast,
} from '@eduvault/ui';
import { RoleCopy, warnSkipped, type RoleCopyResult } from './role-copy';
import type { RoleDraft } from './role-draft';

const TEMPLATE_ICONS = {
  'badge-check': BadgeCheckIcon,
  'building-2': Building2Icon,
} as const;

const TEMPLATES = availableRoleTemplates();

type TemplateFields = Required<
  Pick<RoleDraft, 'label' | 'description' | 'permissions' | 'slug'>
>;

function TemplateButton({
  template,
  onPick,
}: {
  template: RoleTemplate;
  onPick: (template: RoleTemplate) => void;
}) {
  const Icon = TEMPLATE_ICONS[template.icon];
  return (
    <Button
      type="button"
      variant="outline"
      className="h-auto justify-start gap-3 py-2 text-left whitespace-normal"
      onClick={() => {
        onPick(template);
      }}
    >
      <Icon />
      <span className="flex flex-col">
        <span>{template.label}</span>
        <span className="text-xs font-normal text-muted-foreground">
          {template.description}
        </span>
      </span>
    </Button>
  );
}

export function RoleStartCard({
  roles,
  editorMap,
  onTemplate,
  onCopy,
}: {
  roles: readonly Role[];
  editorMap: PermissionMap;
  onTemplate: (fields: TemplateFields) => void;
  onCopy: (result: RoleCopyResult) => void;
}) {
  const pick = (template: RoleTemplate) => {
    const { kept, skipped, label, description, slug } = applyRoleTemplate(
      template,
      editorMap
    );
    if (skipped.length === 0) {
      toast.success(
        <>
          Filled from the <strong>{label}</strong> template. Review, then
          create.
        </>
      );
    } else {
      warnSkipped(skipped);
    }
    onTemplate({ label, description, slug, permissions: kept });
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>Start from a template</CardTitle>
        <CardDescription>
          Permissions you don’t hold are skipped.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="grid gap-2 sm:grid-cols-2">
          {TEMPLATES.map((template) => (
            <TemplateButton
              key={template.key}
              template={template}
              onPick={pick}
            />
          ))}
        </div>
        <RoleCopy roles={roles} editorMap={editorMap} onCopy={onCopy} />
      </CardContent>
    </Card>
  );
}
