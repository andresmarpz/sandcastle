import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import {
	closestCenter,
	DndContext,
	type DragEndEvent,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import { restrictToHorizontalAxis } from "@dnd-kit/modifiers";
import {
	arrayMove,
	horizontalListSortingStrategy,
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, X } from "lucide-react";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useMemo,
	useState,
} from "react";

import { cn } from "@/lib/utils";
import { Button } from "./button";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface PanelTab {
	id: string;
	label: ReactNode;
}

interface PanelContextValue {
	tabs: PanelTab[];
	activeTab: string | null;
	setActiveTab: (id: string) => void;
	closeTab: (id: string) => void;
	addTab: (tab: PanelTab) => void;
	reorderTabs: (oldIndex: number, newIndex: number) => void;
	onAddClick?: () => void;
	closable: boolean;
	reorderable: boolean;
}

// -----------------------------------------------------------------------------
// Context
// -----------------------------------------------------------------------------

const PanelContext = createContext<PanelContextValue | null>(null);

function usePanelContext() {
	const context = useContext(PanelContext);
	if (!context) {
		throw new Error("Panel components must be used within a Panel");
	}
	return context;
}

// -----------------------------------------------------------------------------
// Panel (Root)
// -----------------------------------------------------------------------------

interface PanelProps {
	children: ReactNode;
	className?: string;
	/** Controlled tabs list */
	tabs?: PanelTab[];
	/** Controlled active tab */
	activeTab?: string | null;
	/** Callback when active tab changes */
	onActiveTabChange?: (id: string) => void;
	/** Callback when a tab is closed */
	onTabClose?: (id: string) => void;
	/** Callback when tabs are reordered */
	onTabsReorder?: (tabs: PanelTab[]) => void;
	/** Callback when add button is clicked */
	onAddClick?: () => void;
	/** Whether tabs can be closed (default: true) */
	closable?: boolean;
	/** Whether tabs can be reordered (default: true) */
	reorderable?: boolean;
	/** Default active tab for uncontrolled mode */
	defaultActiveTab?: string;
}

function Panel({
	children,
	className,
	tabs: controlledTabs,
	activeTab: controlledActiveTab,
	onActiveTabChange,
	onTabClose,
	onTabsReorder,
	onAddClick,
	closable = true,
	reorderable = true,
	defaultActiveTab,
}: PanelProps) {
	// Internal state for uncontrolled mode
	const [internalTabs, setInternalTabs] = useState<PanelTab[]>([]);
	const [internalActiveTab, setInternalActiveTab] = useState<string | null>(
		defaultActiveTab ?? null,
	);

	// Determine if controlled or uncontrolled
	const isControlled = controlledTabs !== undefined;
	const tabs = isControlled ? controlledTabs : internalTabs;
	const activeTab = isControlled
		? (controlledActiveTab ?? null)
		: internalActiveTab;

	const setActiveTab = useCallback(
		(id: string) => {
			if (isControlled) {
				onActiveTabChange?.(id);
			} else {
				setInternalActiveTab(id);
			}
		},
		[isControlled, onActiveTabChange],
	);

	const closeTab = useCallback(
		(id: string) => {
			if (isControlled) {
				onTabClose?.(id);
			} else {
				setInternalTabs((prev) => prev.filter((t) => t.id !== id));
				// If closing the active tab, select the previous or next tab
				if (activeTab === id) {
					const currentIndex = tabs.findIndex((t) => t.id === id);
					const newTabs = tabs.filter((t) => t.id !== id);
					if (newTabs.length > 0) {
						const newIndex = Math.min(currentIndex, newTabs.length - 1);
						const nextTab = newTabs[newIndex];
						if (nextTab) {
							setInternalActiveTab(nextTab.id);
						}
					} else {
						setInternalActiveTab(null);
					}
				}
			}
		},
		[isControlled, onTabClose, activeTab, tabs],
	);

	const addTab = useCallback(
		(tab: PanelTab) => {
			if (!isControlled) {
				setInternalTabs((prev) => [...prev, tab]);
				setInternalActiveTab(tab.id);
			}
		},
		[isControlled],
	);

	const reorderTabs = useCallback(
		(oldIndex: number, newIndex: number) => {
			if (isControlled) {
				const newTabs = arrayMove(tabs, oldIndex, newIndex);
				onTabsReorder?.(newTabs);
			} else {
				setInternalTabs((prev) => arrayMove(prev, oldIndex, newIndex));
			}
		},
		[isControlled, tabs, onTabsReorder],
	);

	const contextValue = useMemo<PanelContextValue>(
		() => ({
			tabs,
			activeTab,
			setActiveTab,
			closeTab,
			addTab,
			reorderTabs,
			onAddClick,
			closable,
			reorderable,
		}),
		[
			tabs,
			activeTab,
			setActiveTab,
			closeTab,
			addTab,
			reorderTabs,
			onAddClick,
			closable,
			reorderable,
		],
	);

	return (
		<PanelContext.Provider value={contextValue}>
			<TabsPrimitive.Root
				data-slot="panel"
				value={activeTab ?? undefined}
				onValueChange={(value) => setActiveTab(value as string)}
				className={cn("flex flex-col", className)}
			>
				{children}
			</TabsPrimitive.Root>
		</PanelContext.Provider>
	);
}

// -----------------------------------------------------------------------------
// SortableTab
// -----------------------------------------------------------------------------

interface SortableTabProps {
	tab: PanelTab;
	isActive: boolean;
	closable: boolean;
	reorderable: boolean;
	onClose: (id: string) => void;
}

function SortableTab({
	tab,
	isActive,
	closable,
	reorderable,
	onClose,
}: SortableTabProps) {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: tab.id });

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
	};

	return (
		<TabsPrimitive.Tab
			ref={setNodeRef}
			style={style}
			value={tab.id}
			data-slot="panel-tab"
			data-dragging={isDragging || undefined}
			className={cn(
				"group relative flex items-center gap-1 px-3 py-1.5 text-sm",
				"border-r border-border",
				"text-muted-foreground hover:text-foreground hover:bg-muted/50",
				"transition-colors outline-none",
				"focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
				"data-[selected]:bg-background data-[selected]:text-foreground",
				"whitespace-nowrap",
				"data-[dragging]:opacity-50 data-[dragging]:z-50",
			)}
		>
			{reorderable && (
				<span
					className={cn(
						"size-4 shrink-0 flex items-center justify-center cursor-grab active:cursor-grabbing",
						"opacity-0 group-hover:opacity-60 group-data-[selected]:opacity-60",
						"hover:opacity-100",
						"transition-opacity",
					)}
					{...attributes}
					{...listeners}
				>
					<GripVertical className="size-3" />
				</span>
			)}
			<span className="truncate max-w-[150px]">{tab.label}</span>
			{closable && (
				<span
					role="button"
					tabIndex={0}
					onClick={(e) => {
						e.stopPropagation();
						onClose(tab.id);
					}}
					onKeyDown={(e) => {
						if (e.key === "Enter" || e.key === " ") {
							e.preventDefault();
							e.stopPropagation();
							onClose(tab.id);
						}
					}}
					className={cn(
						"size-4 shrink-0 rounded-sm flex items-center justify-center",
						"opacity-0 group-hover:opacity-100 group-data-[selected]:opacity-100",
						"hover:bg-muted-foreground/20",
						"transition-opacity",
					)}
					aria-label={`Close ${tab.label}`}
				>
					<X className="size-3" />
				</span>
			)}
		</TabsPrimitive.Tab>
	);
}

// -----------------------------------------------------------------------------
// PanelHeader
// -----------------------------------------------------------------------------

interface PanelHeaderProps {
	className?: string;
	children?: ReactNode;
}

function PanelHeader({ className, children }: PanelHeaderProps) {
	const {
		tabs,
		activeTab,
		closeTab,
		reorderTabs,
		onAddClick,
		closable,
		reorderable,
	} = usePanelContext();

	const sensors = useSensors(
		useSensor(PointerSensor, {
			activationConstraint: {
				distance: 8,
			},
		}),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	const handleDragEnd = useCallback(
		(event: DragEndEvent) => {
			const { active, over } = event;

			if (over && active.id !== over.id) {
				const oldIndex = tabs.findIndex((t) => t.id === active.id);
				const newIndex = tabs.findIndex((t) => t.id === over.id);
				reorderTabs(oldIndex, newIndex);
			}
		},
		[tabs, reorderTabs],
	);

	const tabIds = useMemo(() => tabs.map((t) => t.id), [tabs]);

	return (
		<div
			data-slot="panel-header"
			className={cn(
				"border-b border-border bg-muted/30 flex items-center gap-1",
				className,
			)}
		>
			<div className="flex-1 overflow-x-auto overflow-y-hidden">
				<DndContext
					sensors={sensors}
					collisionDetection={closestCenter}
					modifiers={[restrictToHorizontalAxis]}
					onDragEnd={handleDragEnd}
				>
					<SortableContext
						items={tabIds}
						strategy={horizontalListSortingStrategy}
					>
						<TabsPrimitive.List
							data-slot="panel-tabs"
							className="flex items-center"
						>
							{tabs.map((tab) => (
								<SortableTab
									key={tab.id}
									tab={tab}
									isActive={activeTab === tab.id}
									closable={closable}
									reorderable={reorderable}
									onClose={closeTab}
								/>
							))}
							{onAddClick && (
								<Button
									variant="ghost"
									size="icon-xs"
									onClick={onAddClick}
									className="mx-1 shrink-0"
									aria-label="Add tab"
								>
									<Plus className="size-3.5" />
								</Button>
							)}
						</TabsPrimitive.List>
					</SortableContext>
				</DndContext>
			</div>

			{children}
		</div>
	);
}

// -----------------------------------------------------------------------------
// PanelContent
// -----------------------------------------------------------------------------

interface PanelContentProps {
	className?: string;
	children: ReactNode;
	/** The tab id this content belongs to */
	value: string;
	/** Keep the panel mounted when inactive (default: true) */
	keepMounted?: boolean;
}

function PanelContent({
	className,
	children,
	value,
	keepMounted = true,
}: PanelContentProps) {
	return (
		<TabsPrimitive.Panel
			data-slot="panel-content"
			value={value}
			keepMounted={keepMounted}
			className={cn("flex-1 outline-none", className)}
		>
			{children}
		</TabsPrimitive.Panel>
	);
}

// -----------------------------------------------------------------------------
// PanelBody (renders all content panels)
// -----------------------------------------------------------------------------

interface PanelBodyProps {
	className?: string;
	children: ReactNode;
}

function PanelBody({ className, children }: PanelBodyProps) {
	return (
		<div
			data-slot="panel-body"
			className={cn("flex-1 overflow-hidden bg-background", className)}
		>
			{children}
		</div>
	);
}

// -----------------------------------------------------------------------------
// Exports
// -----------------------------------------------------------------------------

export {
	Panel,
	PanelHeader,
	PanelContent,
	PanelBody,
	usePanelContext,
	type PanelTab,
	type PanelProps,
};
