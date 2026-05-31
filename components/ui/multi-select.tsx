import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import {
	CheckIcon,
	XCircle,
	ChevronDown,
	XIcon,
	WandSparkles,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	Drawer,
	DrawerContent,
	DrawerHeader,
	DrawerTitle,
	DrawerFooter,
	DrawerClose,
} from "@/components/ui/drawer";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandSeparator,
} from "@/components/ui/command";

/**
 * Animation types and configurations
 */
export interface AnimationConfig {
	/** Badge animation type */
	badgeAnimation?: "bounce" | "pulse" | "wiggle" | "fade" | "slide" | "none";
	/** Popover animation type */
	popoverAnimation?: "scale" | "slide" | "fade" | "flip" | "none";
	/** Option hover animation type */
	optionHoverAnimation?: "highlight" | "scale" | "glow" | "none";
	/** Animation duration in seconds */
	duration?: number;
	/** Animation delay in seconds */
	delay?: number;
}

/**
 * Variants for the multi-select component to handle different styles.
 * Uses class-variance-authority (cva) to define different styles based on "variant" prop.
 */
const multiSelectVariants = cva("m-1 transition-all duration-300 ease-in-out", {
	variants: {
		variant: {
			default: "border-foreground/10 text-foreground bg-card hover:bg-card/80",
			secondary:
				"border-foreground/10 bg-secondary text-secondary-foreground hover:bg-secondary/80",
			destructive:
				"border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
			inverted: "inverted",
		},
		badgeAnimation: {
			bounce: "hover:-translate-y-1 hover:scale-110",
			pulse: "hover:animate-pulse",
			wiggle: "hover:animate-wiggle",
			fade: "hover:opacity-80",
			slide: "hover:translate-x-1",
			none: "",
		},
	},
	defaultVariants: {
		variant: "default",
		badgeAnimation: "bounce",
	},
});

/**
 * Option interface for MultiSelect component
 */
interface MultiSelectOption {
	/** The text to display for the option. */
	label: string;
	/** The unique value associated with the option. */
	value: string;
	/** Optional icon component to display alongside the option. */
	icon?: React.ComponentType<{ className?: string }>;
	/** Whether this option is disabled */
	disabled?: boolean;
	/** Custom styling for the option */
	style?: {
		/** Custom badge color */
		badgeColor?: string;
		/** Custom icon color */
		iconColor?: string;
		/** Gradient background for badge */
		gradient?: string;
	};
	/** Shorter label shown in the trigger badge instead of label */
	badgeLabel?: string;
	/** Render a visual separator after this option in the dropdown */
	separator?: boolean;
	/** When an option with value === groupKey is selected, hide this option's badge in the trigger */
	groupKey?: string;
}

/**
 * Group interface for organizing options
 */
interface MultiSelectGroup {
	/** Group heading */
	heading: string;
	/** Options in this group */
	options: MultiSelectOption[];
	/**
	 * When true and ALL non-disabled options in the group are selected,
	 * collapse individual badges in the trigger into a single badge
	 * showing the group heading.
	 */
	collapseGroupBadge?: boolean;
}

/**
 * A typed badge entry for the trigger button.
 * – `option`: a single selected option (normal case)
 * – `group`:  a whole group collapsed into one badge
 *             (when collapseGroupBadge: true and every non-disabled
 *             item in the group is selected)
 */
type TriggerBadge =
	| { kind: "option"; value: string; option: MultiSelectOption }
	| { kind: "group"; heading: string; group: MultiSelectGroup };

/**
 * Props for MultiSelect component
 */
interface MultiSelectProps
	extends Omit<
			React.ButtonHTMLAttributes<HTMLButtonElement>,
			"animationConfig"
		>,
		VariantProps<typeof multiSelectVariants> {
	options: MultiSelectOption[] | MultiSelectGroup[];
	onValueChange: (value: string[]) => void;
	defaultValue?: string[];
	placeholder?: string;
	animation?: number;
	animationConfig?: AnimationConfig;
	maxCount?: number;
	modalPopover?: boolean;
	asChild?: boolean;
	className?: string;
	hideSelectAll?: boolean;
	searchable?: boolean;
	emptyIndicator?: React.ReactNode;
	autoSize?: boolean;
	singleLine?: boolean;
	popoverClassName?: string;
	disabled?: boolean;
	responsive?:
		| boolean
		| {
				mobile?: { maxCount?: number; hideIcons?: boolean; compactMode?: boolean };
				tablet?: { maxCount?: number; hideIcons?: boolean; compactMode?: boolean };
				desktop?: { maxCount?: number; hideIcons?: boolean; compactMode?: boolean };
		  };
	minWidth?: string;
	maxWidth?: string;
	deduplicateOptions?: boolean;
	/**
	 * When `defaultValue` changes, update internal state to match.
	 * This is **uncontrolled** behaviour — the component still owns its state.
	 * For a fully controlled component, manage `defaultValue` externally and
	 * use the `ref.setSelectedValues()` imperative API instead.
	 * @default true
	 */
	resetOnDefaultValueChange?: boolean;
	closeOnSelect?: boolean;
}

/**
 * Imperative methods exposed through ref
 */
export interface MultiSelectRef {
	reset: () => void;
	getSelectedValues: () => string[];
	setSelectedValues: (values: string[]) => void;
	clear: () => void;
	focus: () => void;
}

export const MultiSelect = React.forwardRef<MultiSelectRef, MultiSelectProps>(
	(
		{
			options,
			onValueChange,
			variant,
			defaultValue = [],
			placeholder = "Select options",
			animation = 0,
			animationConfig,
			maxCount = 3,
			modalPopover = false,
			asChild = false,
			className,
			hideSelectAll = false,
			searchable = true,
			emptyIndicator,
			autoSize = false,
			singleLine = false,
			popoverClassName,
			disabled = false,
			responsive,
			minWidth,
			maxWidth,
			deduplicateOptions = false,
			resetOnDefaultValueChange = true,
			closeOnSelect = false,
			...props
		},
		ref
	) => {
		const [selectedValues, setSelectedValues] =
			React.useState<string[]>(defaultValue);
		const [isPopoverOpen, setIsPopoverOpen] = React.useState(false);
		const [isAnimating, setIsAnimating] = React.useState(false);
		const [searchValue, setSearchValue] = React.useState("");

		const [politeMessage, setPoliteMessage] = React.useState("");
		const [assertiveMessage, setAssertiveMessage] = React.useState("");
		const prevSelectedCount = React.useRef(selectedValues.length);
		const prevIsOpen = React.useRef(isPopoverOpen);
		const prevSearchValue = React.useRef(searchValue);

		const announce = React.useCallback(
			(message: string, priority: "polite" | "assertive" = "polite") => {
				if (priority === "assertive") {
					setAssertiveMessage(message);
					setTimeout(() => setAssertiveMessage(""), 100);
				} else {
					setPoliteMessage(message);
					setTimeout(() => setPoliteMessage(""), 100);
				}
			},
			[]
		);

		const multiSelectId = React.useId();
		const listboxId = `${multiSelectId}-listbox`;
		const triggerDescriptionId = `${multiSelectId}-description`;
		const selectedCountId = `${multiSelectId}-count`;

		const prevDefaultValueRef = React.useRef<string[]>(defaultValue);

		const isGroupedOptions = React.useCallback(
			(
				opts: MultiSelectOption[] | MultiSelectGroup[]
			): opts is MultiSelectGroup[] => {
				return opts.length > 0 && "heading" in opts[0];
			},
			[]
		);

		const arraysEqual = React.useCallback(
			(a: string[], b: string[]): boolean => {
				if (a.length !== b.length) return false;
				const sortedA = [...a].sort();
				const sortedB = [...b].sort();
				return sortedA.every((val, index) => val === sortedB[index]);
			},
			[]
		);

		const resetToDefault = React.useCallback(() => {
			setSelectedValues(defaultValue);
			setIsPopoverOpen(false);
			setSearchValue("");
			onValueChange(defaultValue);
		}, [defaultValue, onValueChange]);

		const buttonRef = React.useRef<HTMLButtonElement>(null);

		React.useImperativeHandle(
			ref,
			() => ({
				reset: resetToDefault,
				getSelectedValues: () => selectedValues,
				setSelectedValues: (values: string[]) => {
					setSelectedValues(values);
					onValueChange(values);
				},
				clear: () => {
					setSelectedValues([]);
					onValueChange([]);
				},
				focus: () => {
					if (buttonRef.current) {
						buttonRef.current.focus();
						const originalOutline = buttonRef.current.style.outline;
						const originalOutlineOffset = buttonRef.current.style.outlineOffset;
						buttonRef.current.style.outline = "2px solid hsl(var(--ring))";
						buttonRef.current.style.outlineOffset = "2px";
						setTimeout(() => {
							if (buttonRef.current) {
								buttonRef.current.style.outline = originalOutline;
								buttonRef.current.style.outlineOffset = originalOutlineOffset;
							}
						}, 1000);
					}
				},
			}),
			[resetToDefault, selectedValues, onValueChange]
		);

		const [screenSize, setScreenSize] = React.useState<
			"mobile" | "tablet" | "desktop"
		>("desktop");

		React.useEffect(() => {
			if (typeof window === "undefined") return;
			const handleResize = () => {
				const width = window.innerWidth;
				if (width < 640) {
					setScreenSize("mobile");
				} else if (width < 1024) {
					setScreenSize("tablet");
				} else {
					setScreenSize("desktop");
				}
			};
			handleResize();
			window.addEventListener("resize", handleResize);
			return () => {
				if (typeof window !== "undefined") {
					window.removeEventListener("resize", handleResize);
				}
			};
		}, []);

		const getResponsiveSettings = () => {
			if (!responsive) {
				return { maxCount, hideIcons: false, compactMode: false };
			}
			if (responsive === true) {
				const defaultResponsive = {
					mobile: { maxCount: 2, hideIcons: false, compactMode: true },
					tablet: { maxCount: 4, hideIcons: false, compactMode: false },
					desktop: { maxCount: 6, hideIcons: false, compactMode: false },
				};
				const currentSettings = defaultResponsive[screenSize];
				return {
					maxCount: currentSettings?.maxCount ?? maxCount,
					hideIcons: currentSettings?.hideIcons ?? false,
					compactMode: currentSettings?.compactMode ?? false,
				};
			}
			const currentSettings = responsive[screenSize];
			return {
				maxCount: currentSettings?.maxCount ?? maxCount,
				hideIcons: currentSettings?.hideIcons ?? false,
				compactMode: currentSettings?.compactMode ?? false,
			};
		};

		const responsiveSettings = getResponsiveSettings();

		const getBadgeAnimationClass = () => {
			if (animationConfig?.badgeAnimation) {
				switch (animationConfig.badgeAnimation) {
					case "bounce":
						return isAnimating
							? "animate-bounce"
							: "hover:-translate-y-1 hover:scale-110";
					case "pulse":
						return "hover:animate-pulse";
					case "wiggle":
						return "hover:animate-wiggle";
					case "fade":
						return "hover:opacity-80";
					case "slide":
						return "hover:translate-x-1";
					case "none":
						return "";
					default:
						return "";
				}
			}
			return isAnimating ? "animate-bounce" : "";
		};

		const getPopoverAnimationClass = () => {
			if (animationConfig?.popoverAnimation) {
				switch (animationConfig.popoverAnimation) {
					case "scale":
						return "animate-scaleIn";
					case "slide":
						return "animate-slideInDown";
					case "fade":
						return "animate-fadeIn";
					case "flip":
						return "animate-flipIn";
					case "none":
						return "";
					default:
						return "";
				}
			}
			return "";
		};

		const getAllOptions = React.useCallback((): MultiSelectOption[] => {
			if (options.length === 0) return [];
			let allOptions: MultiSelectOption[];
			if (isGroupedOptions(options)) {
				allOptions = options.flatMap((group) => group.options);
			} else {
				allOptions = options;
			}
			const valueSet = new Set<string>();
			const duplicates: string[] = [];
			const uniqueOptions: MultiSelectOption[] = [];
			allOptions.forEach((option) => {
				if (valueSet.has(option.value)) {
					duplicates.push(option.value);
					if (!deduplicateOptions) {
						uniqueOptions.push(option);
					}
				} else {
					valueSet.add(option.value);
					uniqueOptions.push(option);
				}
			});
			if (process.env.NODE_ENV === "development" && duplicates.length > 0) {
				const action = deduplicateOptions ? "automatically removed" : "detected";
				console.warn(
					`MultiSelect: Duplicate option values ${action}: ${duplicates.join(", ")}. ` +
						`${
							deduplicateOptions
								? "Duplicates have been removed automatically."
								: "This may cause unexpected behavior. Consider setting 'deduplicateOptions={true}' or ensure all option values are unique."
						}`
				);
			}
			return deduplicateOptions ? uniqueOptions : allOptions;
		}, [options, deduplicateOptions, isGroupedOptions]);

		const getOptionByValue = React.useCallback(
			(value: string): MultiSelectOption | undefined => {
				const option = getAllOptions().find((opt) => opt.value === value);
				if (!option && process.env.NODE_ENV === "development") {
					console.warn(
						`MultiSelect: Option with value "${value}" not found in options list`
					);
				}
				return option;
			},
			[getAllOptions]
		);

		const filteredOptions = React.useMemo(() => {
			if (!searchable || !searchValue) return options;
			if (options.length === 0) return [];
			if (isGroupedOptions(options)) {
				return options
					.map((group) => ({
						...group,
						options: group.options.filter(
							(option) =>
								option.label.toLowerCase().includes(searchValue.toLowerCase()) ||
								option.value.toLowerCase().includes(searchValue.toLowerCase())
						),
					}))
					.filter((group) => group.options.length > 0);
			}
			return options.filter(
				(option) =>
					option.label.toLowerCase().includes(searchValue.toLowerCase()) ||
					option.value.toLowerCase().includes(searchValue.toLowerCase())
			);
		}, [options, searchValue, searchable, isGroupedOptions]);

		const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
			if (event.key === "Enter") {
				setIsPopoverOpen(true);
			} else if (event.key === "Backspace" && !event.currentTarget.value) {
				const newSelectedValues = [...selectedValues];
				newSelectedValues.pop();
				setSelectedValues(newSelectedValues);
				onValueChange(newSelectedValues);
			}
		};

		const toggleOption = (optionValue: string) => {
			if (disabled) return;
			const option = getOptionByValue(optionValue);
			if (option?.disabled) return;
			const newSelectedValues = selectedValues.includes(optionValue)
				? selectedValues.filter((value) => value !== optionValue)
				: [...selectedValues, optionValue];
			setSelectedValues(newSelectedValues);
			onValueChange(newSelectedValues);
			if (closeOnSelect) {
				setIsPopoverOpen(false);
			}
		};

		const handleClear = () => {
			if (disabled) return;
			setSelectedValues([]);
			onValueChange([]);
		};

		const handleTogglePopover = () => {
			if (disabled) return;
			setIsPopoverOpen((prev) => !prev);
		};

		const clearExtraOptions = () => {
			if (disabled) return;
			const newSelectedValues = selectedValues.slice(0, responsiveSettings.maxCount);
			setSelectedValues(newSelectedValues);
			onValueChange(newSelectedValues);
		};

		const toggleAll = () => {
			if (disabled) return;
			const allOptions = getAllOptions().filter((option) => !option.disabled);
			if (selectedValues.length === allOptions.length) {
				handleClear();
			} else {
				const allValues = allOptions.map((option) => option.value);
				setSelectedValues(allValues);
				onValueChange(allValues);
			}
			if (closeOnSelect) {
				setIsPopoverOpen(false);
			}
		};

		const toggleGroup = React.useCallback(
			(groupOptions: MultiSelectOption[]) => {
				if (disabled) return;
				const nonDisabledValues = groupOptions
					.filter((o) => !o.disabled)
					.map((o) => o.value);
				const allSelected = nonDisabledValues.every((v) =>
					selectedValues.includes(v)
				);
				const newSelected = allSelected
					? selectedValues.filter((v) => !nonDisabledValues.includes(v))
					: [...new Set([...selectedValues, ...nonDisabledValues])];
				setSelectedValues(newSelected);
				onValueChange(newSelected);
			},
			[disabled, selectedValues, onValueChange]
		);

		React.useEffect(() => {
			if (!resetOnDefaultValueChange) return;
			const prevDefaultValue = prevDefaultValueRef.current;
			if (!arraysEqual(prevDefaultValue, defaultValue)) {
				if (!arraysEqual(selectedValues, defaultValue)) {
					setSelectedValues(defaultValue);
				}
				prevDefaultValueRef.current = [...defaultValue];
			}
		}, [defaultValue, selectedValues, arraysEqual, resetOnDefaultValueChange]);

		const getWidthConstraints = () => {
			const defaultMinWidth = screenSize === "mobile" ? "0px" : "200px";
			const effectiveMinWidth = minWidth || defaultMinWidth;
			const effectiveMaxWidth = maxWidth || "100%";
			return {
				minWidth: effectiveMinWidth,
				maxWidth: effectiveMaxWidth,
				width: autoSize ? "auto" : "100%",
			};
		};

		const widthConstraints = getWidthConstraints();

		React.useEffect(() => {
			if (!isPopoverOpen) {
				setSearchValue("");
			}
		}, [isPopoverOpen]);

		React.useEffect(() => {
			const selectedCount = selectedValues.length;
			const allOptions = getAllOptions();
			const totalOptions = allOptions.filter((opt) => !opt.disabled).length;
			if (selectedCount !== prevSelectedCount.current) {
				const diff = selectedCount - prevSelectedCount.current;
				if (diff > 0) {
					const addedItems = selectedValues.slice(-diff);
					const addedLabels = addedItems
						.map((value) => allOptions.find((opt) => opt.value === value)?.label)
						.filter(Boolean);
					if (addedLabels.length === 1) {
						announce(
							`${addedLabels[0]} selected. ${selectedCount} of ${totalOptions} options selected.`
						);
					} else {
						announce(
							`${addedLabels.length} options selected. ${selectedCount} of ${totalOptions} total selected.`
						);
					}
				} else if (diff < 0) {
					announce(
						`Option removed. ${selectedCount} of ${totalOptions} options selected.`
					);
				}
				prevSelectedCount.current = selectedCount;
			}

			if (isPopoverOpen !== prevIsOpen.current) {
				if (isPopoverOpen) {
					announce(
						`Dropdown opened. ${totalOptions} options available. Use arrow keys to navigate.`
					);
				} else {
					announce("Dropdown closed.");
				}
				prevIsOpen.current = isPopoverOpen;
			}

			if (searchValue !== prevSearchValue.current && searchValue !== undefined) {
				if (searchValue && isPopoverOpen) {
					const filteredCount = allOptions.filter(
						(opt) =>
							opt.label.toLowerCase().includes(searchValue.toLowerCase()) ||
							opt.value.toLowerCase().includes(searchValue.toLowerCase())
					).length;
					announce(
						`${filteredCount} option${
							filteredCount === 1 ? "" : "s"
						} found for "${searchValue}"`
					);
				}
				prevSearchValue.current = searchValue;
			}
		}, [selectedValues, isPopoverOpen, searchValue, announce, getAllOptions]);

		// Badges to render in the trigger. Groups with collapseGroupBadge collapse
		// all their selected items into a single group badge.
		const visibleBadges = React.useMemo((): TriggerBadge[] => {
			if (!isGroupedOptions(options)) {
				const optMap = new Map(
					(options as MultiSelectOption[]).map((o) => [o.value, o])
				);
				return selectedValues.flatMap((v) => {
					const option = optMap.get(v);
					return option ? [{ kind: "option" as const, value: v, option }] : [];
				});
			}
			const result: TriggerBadge[] = [];
			for (const group of options) {
				const nonDisabled = group.options.filter((o) => !o.disabled);
				const selectedInGroup = nonDisabled.filter((o) =>
					selectedValues.includes(o.value)
				);
				if (
					group.collapseGroupBadge &&
					nonDisabled.length > 0 &&
					selectedInGroup.length === nonDisabled.length
				) {
					result.push({ kind: "group", heading: group.heading, group });
				} else {
					for (const o of selectedInGroup)
						result.push({ kind: "option", value: o.value, option: o });
				}
			}
			return result;
		}, [selectedValues, options, isGroupedOptions]);

		// Shared: the trigger button rendered in both Popover (desktop) and Drawer (mobile)
		const triggerButton = (
			<Button
				ref={buttonRef}
				{...props}
				onClick={handleTogglePopover}
				disabled={disabled}
				role="combobox"
				aria-expanded={isPopoverOpen}
				aria-haspopup="listbox"
				aria-controls={isPopoverOpen ? listboxId : undefined}
				aria-describedby={`${triggerDescriptionId} ${selectedCountId}`}
				aria-label={`Multi-select: ${selectedValues.length} of ${
					getAllOptions().length
				} options selected. ${placeholder}`}
				className={cn(
					"flex p-1 rounded-md border min-h-10 h-auto items-center justify-between bg-inherit hover:bg-inherit [&_svg]:pointer-events-auto",
					autoSize ? "w-auto" : "w-full",
					responsiveSettings.compactMode && "min-h-8 text-sm",
					screenSize === "mobile" && "min-h-12 text-base",
					disabled && "opacity-50 cursor-not-allowed",
					className
				)}
				style={{
					...widthConstraints,
					maxWidth: `min(${widthConstraints.maxWidth}, 100%)`,
				}}>
				{selectedValues.length > 0 ? (
					<div className="flex justify-between items-center w-full">
						<div
							className={cn(
								"flex items-center gap-1",
								singleLine
									? "overflow-x-auto multiselect-singleline-scroll"
									: "flex-wrap",
								responsiveSettings.compactMode && "gap-0.5"
							)}
							style={singleLine ? { paddingBottom: "4px" } : {}}>
							{visibleBadges
								.slice(0, responsiveSettings.maxCount)
								.map((badge) => {
									// ── Group-summary badge ────────────────────────────
									if (badge.kind === "group") {
										const { heading, group } = badge;
										return (
											<Badge
												key={`grp:${heading}`}
												className={cn(
													getBadgeAnimationClass(),
													multiSelectVariants({ variant }),
													responsiveSettings.compactMode && "text-xs px-1.5 py-0.5",
													screenSize === "mobile" && "max-w-[120px] truncate",
													singleLine && "flex-shrink-0 whitespace-nowrap",
													"[&>svg]:pointer-events-auto"
												)}>
												<span className={cn(screenSize === "mobile" && "truncate")}>
													{heading}
												</span>
												<div
													role="button"
													tabIndex={0}
													onClick={(event) => {
														event.stopPropagation();
														toggleGroup(group.options);
													}}
													onKeyDown={(event) => {
														if (event.key === "Enter" || event.key === " ") {
															event.preventDefault();
															event.stopPropagation();
															toggleGroup(group.options);
														}
													}}
													aria-label={`Rimuovi ${heading} dalla selezione`}
													className="ml-2 h-4 w-4 cursor-pointer hover:bg-white/20 rounded-sm p-0.5 -m-0.5 focus:outline-none focus:ring-1 focus:ring-white/50">
													<XCircle
														className={cn(
															"h-3 w-3",
															responsiveSettings.compactMode && "h-2.5 w-2.5"
														)}
													/>
												</div>
											</Badge>
										);
									}
									// ── Individual option badge ─────────────────────────
									const { value, option } = badge;
									const IconComponent = option.icon;
									const customStyle = option.style;
									const badgeStyle: React.CSSProperties = {
										animationDuration: `${animation}s`,
										...(customStyle?.badgeColor && {
											backgroundColor: customStyle.badgeColor,
										}),
										...(customStyle?.gradient && {
											background: customStyle.gradient,
											color: "white",
										}),
									};
									return (
										<Badge
											key={value}
											className={cn(
												getBadgeAnimationClass(),
												multiSelectVariants({ variant }),
												customStyle?.gradient && "text-white border-transparent",
												responsiveSettings.compactMode && "text-xs px-1.5 py-0.5",
												screenSize === "mobile" && "max-w-[120px] truncate",
												singleLine && "flex-shrink-0 whitespace-nowrap",
												"[&>svg]:pointer-events-auto"
											)}
											style={{
												...badgeStyle,
												animationDuration: `${animationConfig?.duration || animation}s`,
												animationDelay: `${animationConfig?.delay || 0}s`,
											}}>
											{IconComponent && !responsiveSettings.hideIcons && (
												<IconComponent
													className={cn(
														"h-4 w-4 mr-2",
														responsiveSettings.compactMode && "h-3 w-3 mr-1",
														customStyle?.iconColor && "text-current"
													)}
													{...(customStyle?.iconColor && {
														style: { color: customStyle.iconColor },
													})}
												/>
											)}
											<span className={cn(screenSize === "mobile" && "truncate")}>
												{option.badgeLabel ?? option.label}
											</span>
											<div
												role="button"
												tabIndex={0}
												onClick={(event) => {
													event.stopPropagation();
													toggleOption(value);
												}}
												onKeyDown={(event) => {
													if (event.key === "Enter" || event.key === " ") {
														event.preventDefault();
														event.stopPropagation();
														toggleOption(value);
													}
												}}
												aria-label={`Rimuovi ${option.badgeLabel ?? option.label} dalla selezione`}
												className="ml-2 h-4 w-4 cursor-pointer hover:bg-white/20 rounded-sm p-0.5 -m-0.5 focus:outline-none focus:ring-1 focus:ring-white/50">
												<XCircle
													className={cn(
														"h-3 w-3",
														responsiveSettings.compactMode && "h-2.5 w-2.5"
													)}
												/>
											</div>
										</Badge>
									);
								})}
							{visibleBadges.length > responsiveSettings.maxCount && (
								<Badge
									className={cn(
										"bg-transparent text-foreground border-foreground/1 hover:bg-transparent",
										getBadgeAnimationClass(),
										multiSelectVariants({ variant }),
										responsiveSettings.compactMode && "text-xs px-1.5 py-0.5",
										singleLine && "flex-shrink-0 whitespace-nowrap",
										"[&>svg]:pointer-events-auto"
									)}
									style={{
										animationDuration: `${animationConfig?.duration || animation}s`,
										animationDelay: `${animationConfig?.delay || 0}s`,
									}}>
									{`+ ${
										visibleBadges.length - responsiveSettings.maxCount
									} more`}
									<XCircle
										className={cn(
											"ml-2 h-4 w-4 cursor-pointer",
											responsiveSettings.compactMode && "ml-1 h-3 w-3"
										)}
										onClick={(event) => {
											event.stopPropagation();
											clearExtraOptions();
										}}
									/>
								</Badge>
							)}
						</div>
						<div className="flex items-center justify-between">
							<div
								role="button"
								tabIndex={0}
								onClick={(event) => {
									event.stopPropagation();
									handleClear();
								}}
								onKeyDown={(event) => {
									if (event.key === "Enter" || event.key === " ") {
										event.preventDefault();
										event.stopPropagation();
										handleClear();
									}
								}}
								aria-label={`Clear all ${selectedValues.length} selected options`}
								className="flex items-center justify-center h-4 w-4 mx-2 cursor-pointer text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 rounded-sm">
								<XIcon className="h-4 w-4" />
							</div>
							<Separator orientation="vertical" className="flex min-h-6 h-full" />
							<ChevronDown
								className="h-4 mx-2 cursor-pointer text-muted-foreground"
								aria-hidden="true"
							/>
						</div>
					</div>
				) : (
					<div className="flex items-center justify-between w-full mx-auto">
						<span className="text-sm text-muted-foreground mx-3">
							{placeholder}
						</span>
						<ChevronDown className="h-4 cursor-pointer text-muted-foreground mx-2" />
					</div>
				)}
			</Button>
		);

		// Shared Command content rendered in both Drawer (mobile) and Popover (desktop)
		const commandContent = (
			<Command>
				{searchable && (
					<CommandInput
						placeholder="Cerca..."
						onKeyDown={handleInputKeyDown}
						value={searchValue}
						onValueChange={setSearchValue}
						aria-label="Search through available options"
						aria-describedby={`${multiSelectId}-search-help`}
					/>
				)}
				{searchable && (
					<div id={`${multiSelectId}-search-help`} className="sr-only">
						Type to filter options. Use arrow keys to navigate results.
					</div>
				)}
				<CommandList
					className={cn(
						"overflow-y-auto multiselect-scrollbar",
						screenSize === "mobile" ? "max-h-[60vh]" : "max-h-[40vh]",
						"overscroll-behavior-y-contain"
					)}>
					<CommandEmpty>
						{emptyIndicator || "No results found."}
					</CommandEmpty>
					{!hideSelectAll && !searchValue && (
						<CommandGroup>
							<CommandItem
								key="all"
								onSelect={toggleAll}
								role="option"
								aria-selected={
									selectedValues.length ===
									getAllOptions().filter((opt) => !opt.disabled).length
								}
								aria-label={`Select all ${getAllOptions().length} options`}
								className="cursor-pointer">
								<div
									className={cn(
										"mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
										selectedValues.length ===
											getAllOptions().filter((opt) => !opt.disabled).length
											? "bg-primary text-primary-foreground"
											: "opacity-50 [&_svg]:invisible"
									)}
									aria-hidden="true">
									<CheckIcon className="h-4 w-4" />
								</div>
								<span>
									(Select All
									{getAllOptions().length > 20
										? ` - ${getAllOptions().length} options`
										: ""}
									)
								</span>
							</CommandItem>
						</CommandGroup>
					)}
					{isGroupedOptions(filteredOptions) ? (
						filteredOptions.map((group) => {
							const groupNonDisabled = group.options
								.filter((o) => !o.disabled)
								.map((o) => o.value);
							const selectedInGroup = groupNonDisabled.filter((v) =>
								selectedValues.includes(v)
							);
							const isGroupAllSelected =
								groupNonDisabled.length > 0 &&
								selectedInGroup.length === groupNonDisabled.length;
							const isGroupPartiallySelected =
								selectedInGroup.length > 0 && !isGroupAllSelected;
							return (
								<CommandGroup key={group.heading} heading={group.heading}>
									<CommandItem
										key={`group-all-${group.heading}`}
										onSelect={() => toggleGroup(group.options)}
										role="option"
										aria-selected={isGroupAllSelected}
										aria-label={`${
											isGroupAllSelected ? "Deseleziona" : "Seleziona"
										} tutte: ${group.heading}`}
										className="cursor-pointer font-medium">
										<div
											className={cn(
												"mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
												isGroupAllSelected
													? "bg-primary text-primary-foreground"
													: isGroupPartiallySelected
													? "bg-primary/30 [&_svg]:visible"
													: "opacity-50 [&_svg]:invisible"
											)}
											aria-hidden="true">
											<CheckIcon className="h-4 w-4" />
										</div>
										<span>Tutte: {group.heading}</span>
									</CommandItem>
									<CommandSeparator className="my-1" />
									{group.options.map((option) => {
										const isSelected = selectedValues.includes(option.value);
										return (
											<React.Fragment key={option.value}>
												<CommandItem
													onSelect={() => toggleOption(option.value)}
													role="option"
													aria-selected={isSelected}
													aria-disabled={option.disabled}
													aria-label={`${option.label}${
														isSelected ? ", selected" : ", not selected"
													}${option.disabled ? ", disabled" : ""}`}
													className={cn(
														"cursor-pointer",
														option.disabled && "opacity-50 cursor-not-allowed"
													)}
													disabled={option.disabled}>
													<div
														className={cn(
															"mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
															isSelected
																? "bg-primary text-primary-foreground"
																: "opacity-50 [&_svg]:invisible"
														)}
														aria-hidden="true">
														<CheckIcon className="h-4 w-4" />
													</div>
													{option.icon && (
														<option.icon
															className="mr-2 h-4 w-4 text-muted-foreground"
															aria-hidden="true"
														/>
													)}
													<span>{option.label}</span>
												</CommandItem>
												{option.separator && (
													<CommandSeparator className="my-1" />
												)}
											</React.Fragment>
										);
									})}
								</CommandGroup>
							);
						})
					) : (
						<CommandGroup>
							{filteredOptions.map((option) => {
								const isSelected = selectedValues.includes(option.value);
								return (
									<CommandItem
										key={option.value}
										onSelect={() => toggleOption(option.value)}
										role="option"
										aria-selected={isSelected}
										aria-disabled={option.disabled}
										aria-label={`${option.label}${
											isSelected ? ", selected" : ", not selected"
										}${option.disabled ? ", disabled" : ""}`}
										className={cn(
											"cursor-pointer",
											option.disabled && "opacity-50 cursor-not-allowed"
										)}
										disabled={option.disabled}>
										<div
											className={cn(
												"mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
												isSelected
													? "bg-primary text-primary-foreground"
													: "opacity-50 [&_svg]:invisible"
											)}
											aria-hidden="true">
											<CheckIcon className="h-4 w-4" />
										</div>
										{option.icon && (
											<option.icon
												className="mr-2 h-4 w-4 text-muted-foreground"
												aria-hidden="true"
											/>
										)}
										<span>{option.label}</span>
									</CommandItem>
								);
							})}
						</CommandGroup>
					)}
					<CommandSeparator />
					<CommandGroup>
						<div className="flex items-center justify-between">
							{selectedValues.length > 0 && (
								<>
									<CommandItem
										onSelect={handleClear}
										className="flex-1 justify-center cursor-pointer">
										Clear
									</CommandItem>
									<Separator
										orientation="vertical"
										className="flex min-h-6 h-full"
									/>
								</>
							)}
							<CommandItem
								onSelect={() => setIsPopoverOpen(false)}
								className="flex-1 justify-center cursor-pointer max-w-full">
								Chiudi
							</CommandItem>
						</div>
					</CommandGroup>
				</CommandList>
			</Command>
		);

		return (
			<>
				<div className="sr-only">
					<div aria-live="polite" aria-atomic="true" role="status">
						{politeMessage}
					</div>
					<div aria-live="assertive" aria-atomic="true" role="alert">
						{assertiveMessage}
					</div>
				</div>
				<div id={triggerDescriptionId} className="sr-only">
					Multi-select. Use arrow keys to navigate, Enter to select, Escape to close.
				</div>
				<div id={selectedCountId} className="sr-only" aria-live="polite">
					{selectedValues.length === 0
						? "No options selected"
						: `${selectedValues.length} option${
								selectedValues.length === 1 ? "" : "s"
						  } selected: ${selectedValues
								.map((value) => getOptionByValue(value)?.label)
								.filter(Boolean)
								.join(", ")}`}
				</div>

				{screenSize === "mobile" ? (
					<>
						{triggerButton}
						<Drawer open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
							<DrawerContent>
								<DrawerHeader>
									<DrawerTitle>{placeholder}</DrawerTitle>
								</DrawerHeader>
								<div
									className="px-4 pb-2 overflow-y-auto"
									id={listboxId}
									role="listbox"
									aria-multiselectable="true"
									aria-label="Available options">
									{commandContent}
								</div>
								<DrawerFooter>
									<DrawerClose asChild>
										<button
											type="button"
											className="w-full h-10 rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
											Fatto
										</button>
									</DrawerClose>
								</DrawerFooter>
							</DrawerContent>
						</Drawer>
					</>
				) : (
					<Popover
						open={isPopoverOpen}
						onOpenChange={setIsPopoverOpen}
						modal={modalPopover}>
						<PopoverTrigger asChild>{triggerButton}</PopoverTrigger>
						<PopoverContent
							id={listboxId}
							role="listbox"
							aria-multiselectable="true"
							aria-label="Available options"
							className={cn(
								"w-auto p-0",
								getPopoverAnimationClass(),
								screenSize === "tablet" && "w-[70vw] max-w-md",
								screenSize === "desktop" && "min-w-[300px]",
								popoverClassName
							)}
							style={{
								animationDuration: `${animationConfig?.duration || animation}s`,
								animationDelay: `${animationConfig?.delay || 0}s`,
								maxWidth: `min(${widthConstraints.maxWidth}, 85vw)`,
								maxHeight: "60vh",
								touchAction: "manipulation",
							}}
							align="start"
							onEscapeKeyDown={() => setIsPopoverOpen(false)}>
							{commandContent}
						</PopoverContent>
						{animation > 0 && selectedValues.length > 0 && (
							<WandSparkles
								className={cn(
									"cursor-pointer my-2 text-foreground bg-background w-3 h-3",
									isAnimating ? "" : "text-muted-foreground"
								)}
								onClick={() => setIsAnimating(!isAnimating)}
							/>
						)}
					</Popover>
				)}
			</>
		);
	}
);


MultiSelect.displayName = "MultiSelect";
export type { MultiSelectOption, MultiSelectGroup, MultiSelectProps };
