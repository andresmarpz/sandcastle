interface FileSystemDirectoryHandle {
	readonly kind: "directory";
	readonly name: string;
}

interface DirectoryPickerOptions {
	id?: string;
	mode?: "read" | "readwrite";
	startIn?:
		| "desktop"
		| "documents"
		| "downloads"
		| "music"
		| "pictures"
		| "videos"
		| FileSystemDirectoryHandle;
}

interface Window {
	showDirectoryPicker(
		options?: DirectoryPickerOptions,
	): Promise<FileSystemDirectoryHandle>;
}
