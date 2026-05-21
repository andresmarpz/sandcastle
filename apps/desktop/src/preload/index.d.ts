type CreateOptions = {
    id: string;
    cols?: number;
    rows?: number;
    cwd?: string;
    shell?: string;
    env?: Record<string, string>;
};
export type MenuPopupItem = {
    type: "separator";
} | {
    type?: "normal";
    id: string;
    label: string;
    enabled?: boolean;
    accelerator?: string;
};
type CaffeinateStatus = {
    enabled: boolean;
    supported: boolean;
};
declare const api: {
    terminal: {
        create: (opts: CreateOptions) => Promise<{
            ok: true;
        }>;
        write: (id: string, data: string) => void;
        resize: (id: string, cols: number, rows: number) => void;
        dispose: (id: string) => void;
        getCwd: (id: string) => Promise<string | null>;
        onData: (id: string, listener: (data: string) => void) => (() => void);
        onExit: (id: string, listener: (info: {
            exitCode: number;
            signal?: number;
        }) => void) => (() => void);
    };
    menu: {
        popup: (items: MenuPopupItem[]) => Promise<string | null>;
    };
    caffeinate: {
        get: () => Promise<CaffeinateStatus>;
        set: (enabled: boolean) => Promise<CaffeinateStatus>;
        onChange: (listener: (enabled: boolean) => void) => (() => void);
    };
    dialog: {
        pickDirectory: () => Promise<string | null>;
    };
};
export type Api = typeof api;
export {};
