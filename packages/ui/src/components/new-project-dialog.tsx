"use client";

import * as React from "react";
import { IconFolderOpen } from "@tabler/icons-react";
import { useAtom, useAtomRefresh } from "@effect-atom/atom-react";

import { createRepositoryMutation, repositoryListAtom, REPOSITORY_LIST_KEY } from "@/api/repository-atoms";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/alert-dialog";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/input-group";
import { Input } from "@/components/input";
import { usePlatform } from "@/context/platform-context";

interface NewProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function getDirectoryLabel(path: string) {
  const trimmed = path.replace(/[\\/]+$/, "");
  const parts = trimmed.split(/[/\\]/);
  return parts[parts.length - 1] || trimmed;
}

export function NewProjectDialog({ open, onOpenChange }: NewProjectDialogProps) {
  const { openDirectory } = usePlatform();
  const [, createRepository] = useAtom(createRepositoryMutation, {
    mode: "promiseExit",
  });
  const refreshRepositories = useAtomRefresh(repositoryListAtom);
  const [directoryPath, setDirectoryPath] = React.useState("");
  const [label, setLabel] = React.useState("");
  const [defaultBranch, setDefaultBranch] = React.useState("");
  const [labelTouched, setLabelTouched] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [hasAutoOpened, setHasAutoOpened] = React.useState(false);

  const resetState = React.useCallback(() => {
    setDirectoryPath("");
    setLabel("");
    setDefaultBranch("");
    setLabelTouched(false);
    setIsSubmitting(false);
    setError(null);
    setHasAutoOpened(false);
  }, []);

  React.useEffect(() => {
    if (!open) {
      resetState();
    }
  }, [open, resetState]);

  const handleBrowse = React.useCallback(async () => {
    setError(null);
    const selection = await openDirectory();
    if (!selection) return;
    const selectedPath = Array.isArray(selection)
      ? selection[0]
      : selection;
    if (!selectedPath) return;
    setDirectoryPath(selectedPath);
    if (!labelTouched) {
      setLabel(getDirectoryLabel(selectedPath));
    }
  }, [openDirectory, labelTouched]);

  React.useEffect(() => {
    if (!open || hasAutoOpened) return;
    setHasAutoOpened(true);
    void handleBrowse();
  }, [open, hasAutoOpened, handleBrowse]);

  const canSubmit = directoryPath.trim().length > 0 && label.trim().length > 0;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit || isSubmitting) {
      setError("Select a folder and enter a project name.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const payload = {
      label: label.trim(),
      directoryPath: directoryPath.trim(),
      ...(defaultBranch.trim().length > 0
        ? { defaultBranch: defaultBranch.trim() }
        : {}),
    };

    try {
      const result = await createRepository({
        payload,
        reactivityKeys: [REPOSITORY_LIST_KEY],
      });

      if (
        result &&
        typeof result === "object" &&
        "_tag" in result &&
        result._tag === "Failure"
      ) {
        setError("Could not create the project. Check the path and try again.");
        return;
      }

      // Refresh the repository list after successful creation
      refreshRepositories();
      onOpenChange(false);
    } catch (submitError) {
      console.error(submitError);
      setError("Could not create the project. Check the path and try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <form onSubmit={handleSubmit}>
          <AlertDialogHeader>
            <AlertDialogTitle>Open project</AlertDialogTitle>
            <AlertDialogDescription>
              Add an existing repository to Sandcastle.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="mt-5 space-y-4">
            <Field>
              <FieldLabel>Project folder</FieldLabel>
              <FieldContent>
                <InputGroup>
                  <InputGroupInput
                    placeholder="Select a folder..."
                    value={directoryPath}
                    onChange={(event) => setDirectoryPath(event.target.value)}
                  />
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton
                      type="button"
                      variant="outline"
                      onClick={handleBrowse}
                    >
                      <IconFolderOpen className="size-3.5" />
                      Browse
                    </InputGroupButton>
                  </InputGroupAddon>
                </InputGroup>
                <FieldDescription>
                  Choose the root folder of a git repository.
                </FieldDescription>
              </FieldContent>
            </Field>

            <Field>
              <FieldLabel>Project name</FieldLabel>
              <FieldContent>
                <Input
                  placeholder="My project"
                  value={label}
                  onChange={(event) => {
                    setLabel(event.target.value);
                    setLabelTouched(true);
                  }}
                />
              </FieldContent>
            </Field>

            <Field>
              <FieldLabel>Default branch</FieldLabel>
              <FieldContent>
                <Input
                  placeholder="main"
                  value={defaultBranch}
                  onChange={(event) => setDefaultBranch(event.target.value)}
                />
                <FieldDescription>
                  Optional. Leave blank to use the server default.
                </FieldDescription>
              </FieldContent>
            </Field>

            {error ? (
              <p className="text-destructive text-sm">{error}</p>
            ) : null}
          </div>

          <AlertDialogFooter className="mt-6">
            <AlertDialogCancel disabled={isSubmitting}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction type="submit" disabled={!canSubmit || isSubmitting}>
              {isSubmitting ? "Adding..." : "Add project"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
