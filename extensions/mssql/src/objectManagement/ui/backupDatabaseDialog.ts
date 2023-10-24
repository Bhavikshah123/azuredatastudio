/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as azdata from 'azdata';
import { ObjectManagementDialogBase, ObjectManagementDialogOptions } from './objectManagementDialogBase';
import { BackupInfo, IObjectManagementService, ObjectManagement } from 'mssql';
import { Database, DatabaseViewInfo } from '../interfaces';
import { BackupDatabaseDocUrl } from '../constants';
import * as loc from '../localizedConstants';
import { DefaultInputWidth, DialogButton } from '../../ui/dialogBase';
import { isUndefinedOrNull } from '../../types';
import { TaskExecutionMode } from 'azdata';

export class BackupDatabaseDialog extends ObjectManagementDialogBase<Database, DatabaseViewInfo> {
	private _backupNameInput: azdata.InputBoxComponent;
	private _backupTypeDropdown: azdata.DropDownComponent;
	private _copyBackupCheckbox: azdata.CheckBoxComponent;
	private _backupDestDropdown: azdata.DropDownComponent;
	private _backupFilesTable: azdata.TableComponent;

	private _existingMediaButton: azdata.RadioButtonComponent;
	private _appendExistingMediaButton: azdata.RadioButtonComponent;
	private _overwriteExistingMediaButton: azdata.RadioButtonComponent;

	private _newMediaButton: azdata.RadioButtonComponent;
	private _mediaNameInput: azdata.InputBoxComponent;
	private _mediaDescriptionInput: azdata.InputBoxComponent;

	private _verifyCheckbox: azdata.CheckBoxComponent;
	private _checksumCheckbox: azdata.CheckBoxComponent;
	private _continueOnErrorCheckbox: azdata.CheckBoxComponent;

	private _truncateLogButton: azdata.RadioButtonComponent;
	private _backupLogTailButton: azdata.RadioButtonComponent;

	private _compressionTypeDropdown: azdata.DropDownComponent;

	private _encryptCheckbox: azdata.CheckBoxComponent;
	private _algorithmDropdown: azdata.DropDownComponent;
	private _encryptorDropdown: azdata.DropDownComponent;

	constructor(objectManagementService: IObjectManagementService, options: ObjectManagementDialogOptions) {
		super(objectManagementService, options, loc.BackupDatabaseDialogTitle(options.database), 'BackupDatabase');
		this.dialogObject.okButton.label = loc.BackupButtonLabel;
	}

	protected override get helpUrl(): string {
		return BackupDatabaseDocUrl;
	}

	protected override get saveChangesTaskLabel(): string {
		return loc.BackupDatabaseOperationDisplayName(this.objectInfo.name);
	}

	protected override get opensEditorSeparately(): boolean {
		return true;
	}

	protected override async initializeUI(): Promise<void> {
		let generalSection = this.initializeGeneralSection();
		let optionsSection = this.initializeOptionsSection();

		this.formContainer.addItems([generalSection, optionsSection]);
	}

	private initializeGeneralSection(): azdata.GroupContainer {
		let components: azdata.Component[] = [];
		const backupTypes = [loc.BackupFull, loc.BackupDifferential, loc.BackupTransactionLog];
		let defaultName = this.getDefaultFileName(backupTypes[0]);
		this._backupNameInput = this.createInputBox(newValue => {
			return Promise.resolve();
		}, {
			ariaLabel: defaultName,
			inputType: 'text',
			enabled: true,
			value: defaultName,
			width: DefaultInputWidth
		});
		let backupInputContainer = this.createLabelInputContainer(loc.BackupNameLabel, this._backupNameInput);
		components.push(backupInputContainer);

		// Recovery Model field is always disabled since it's a database setting
		let recoveryModelInput = this.createInputBox(newValue => {
			return Promise.resolve();
		}, {
			ariaLabel: this.objectInfo.recoveryModel,
			inputType: 'text',
			enabled: false,
			value: this.objectInfo.recoveryModel,
			width: DefaultInputWidth
		});
		let recoveryInputContainer = this.createLabelInputContainer(loc.BackupRecoveryLabel, recoveryModelInput);
		components.push(recoveryInputContainer);

		this._backupTypeDropdown = this.createDropdown(loc.BackupTypeLabel, async newValue => {
			// Update backup name with new backup type
			this._backupNameInput.value = this._backupNameInput.ariaLabel = this.getDefaultFileName(newValue);
		}, backupTypes, backupTypes[0]);
		let backupContainer = this.createLabelInputContainer(loc.BackupTypeLabel, this._backupTypeDropdown);
		components.push(backupContainer);

		this._copyBackupCheckbox = this.createCheckbox(loc.BackupCopyLabel, () => undefined);
		components.push(this._copyBackupCheckbox);

		const backupDestinations = [loc.BackupDiskLabel]; // TODO: Add URL type when enabled
		this._backupDestDropdown = this.createDropdown(loc.BackupToLabel, checked => {
			return Promise.resolve();
		}, backupDestinations, backupDestinations[0]);
		let backupDestContainer = this.createLabelInputContainer(loc.BackupToLabel, this._backupDestDropdown);
		components.push(backupDestContainer);

		this._backupFilesTable = this.createTable(loc.BackupFilesLabel, [loc.BackupFilesLabel], []);
		this.disposables.push(this._backupFilesTable.onRowSelected(() => this.onFileRowSelected()))
		components.push(this._backupFilesTable);

		let addButton: DialogButton = {
			buttonAriaLabel: loc.AddBackupFileAriaLabel,
			buttonHandler: async () => await this.onAddFilesButtonClicked()
		};
		let removeButton: DialogButton = {
			buttonAriaLabel: loc.RemoveBackupFileAriaLabel,
			buttonHandler: async () => await this.onRemoveFilesButtonClicked()
		};
		const buttonContainer = this.addButtonsForTable(this._backupFilesTable, addButton, removeButton);
		components.push(buttonContainer);

		return this.createGroup(loc.GeneralSectionHeader, components, false);
	}

	private initializeOptionsSection(): azdata.GroupContainer {
		// Media options
		// Options for overwriting existing media - enabled by default
		const existingGroupId = 'BackupExistingMedia';
		this._appendExistingMediaButton = this.createRadioButton(loc.AppendToExistingBackup, existingGroupId, true, checked => {
			return Promise.resolve();
		});
		this._overwriteExistingMediaButton = this.createRadioButton(loc.OverwriteExistingBackups, existingGroupId, false, checked => {
			return Promise.resolve();
		});

		// Options for writing to new media
		this._mediaNameInput = this.createInputBox(newValue => {
			return Promise.resolve();
		}, { enabled: false });
		let mediaSetContainer = this.createLabelInputContainer(loc.BackupNewMediaName, this._mediaNameInput);
		this._mediaDescriptionInput = this.createInputBox(newValue => {
			return Promise.resolve();
		}, { enabled: false });
		let mediaDescriptionContainer = this.createLabelInputContainer(loc.BackupNewMediaDescription, this._mediaDescriptionInput);
		let newMediaButtonsGroup = this.createGroup('', [mediaSetContainer, mediaDescriptionContainer]);

		// Overall button that selects overwriting existing media - enabled by default
		const overwriteGroupId = 'BackupOverwriteMedia';
		this._existingMediaButton = this.createRadioButton(loc.BackupToExistingMedia, overwriteGroupId, true, async checked => {
			if (checked) {
				this._appendExistingMediaButton.enabled = true;
				this._overwriteExistingMediaButton.enabled = true;

				this._mediaNameInput.enabled = false;
				this._mediaDescriptionInput.enabled = false;
			}
		});
		let existingMediaButtonsGroup = this.createGroup('', [this._appendExistingMediaButton, this._overwriteExistingMediaButton]);

		// Overall button that selects writing to new media
		this._newMediaButton = this.createRadioButton(loc.BackupAndEraseExisting, overwriteGroupId, false, async checked => {
			if (checked) {
				this._appendExistingMediaButton.enabled = false;
				this._overwriteExistingMediaButton.enabled = false;

				this._mediaNameInput.enabled = true;
				this._mediaDescriptionInput.enabled = true;
			}
		});

		let overwriteGroup = this.createGroup(loc.BackupOverwriteMediaLabel, [
			this._existingMediaButton,
			existingMediaButtonsGroup,
			this._newMediaButton,
			newMediaButtonsGroup
		], false);

		// Reliability
		this._verifyCheckbox = this.createCheckbox(loc.VerifyBackupWhenFinished, checked => {
			return Promise.resolve();
		});
		this._checksumCheckbox = this.createCheckbox(loc.BackupPerformChecksum, checked => {
			return Promise.resolve();
		});
		this._continueOnErrorCheckbox = this.createCheckbox(loc.BackupContinueOnError, checked => {
			return Promise.resolve();
		});

		let reliabilityGroup = this.createGroup(loc.BackupReliabilityLabel, [this._verifyCheckbox, this._checksumCheckbox, this._continueOnErrorCheckbox], false);

		// Transaction log
		// Only should be enabled if backup type is Transaction Log
		const transactionGroupId = 'BackupTransactionLog';
		this._truncateLogButton = this.createRadioButton(loc.BackupTruncateLog, transactionGroupId, false, checked => {
			return Promise.resolve();
		}, false);
		this._backupLogTailButton = this.createRadioButton(loc.BackupLogTail, transactionGroupId, false, checked => {
			return Promise.resolve();
		}, false);
		let transactionDescription = this.modelView.modelBuilder.text().withProps({ value: loc.TransactionLogNotice }).component();
		let transactionGroup = this.createGroup(loc.BackupTransactionLog, [this._truncateLogButton, this._backupLogTailButton, transactionDescription], false);

		// Compression
		let compressionValues = [loc.BackupDefaultSetting, loc.CompressBackup, loc.DontCompressBackup];
		this._compressionTypeDropdown = this.createDropdown(loc.BackupSetCompression, newValue => {
			return Promise.resolve();
		}, compressionValues, compressionValues[0]);
		let compressionContainer = this.createLabelInputContainer(loc.BackupSetCompression, this._compressionTypeDropdown);
		let compressionGroup = this.createGroup(loc.BackupCompressionLabel, [compressionContainer], false);

		// Encryption
		this._encryptCheckbox = this.createCheckbox(loc.EncryptBackup, checked => {
			return Promise.resolve();
		}, false, false);

		let algorithmValues = [aes128, aes192, aes256, tripleDES];
		this._algorithmDropdown = this.createDropdown(loc.BackupAlgorithm, newValue => {
			return Promise.resolve();
		}, algorithmValues, algorithmValues[0], false);
		let algorithmContainer = this.createLabelInputContainer(loc.BackupAlgorithm, this._algorithmDropdown);

		let encryptorValues = this.getEncryptorOptions();
		this._encryptorDropdown = this.createDropdown(loc.BackupCertificate, newValue => {
			return Promise.resolve();
		}, encryptorValues, encryptorValues[0], false);
		let encryptorContainer = this.createLabelInputContainer(loc.BackupCertificate, this._encryptorDropdown);

		let encryptionDescription = this.modelView.modelBuilder.text().withProps({ value: loc.BackupEncryptNotice }).component();
		let algorithmGroup = this.createGroup('', [algorithmContainer, encryptorContainer, encryptionDescription]);
		let encryptionGroup = this.createGroup(loc.BackupEncryptionLabel, [this._encryptCheckbox, algorithmGroup], false);

		return this.createGroup(loc.OptionsSectionHeader, [overwriteGroup, reliabilityGroup, transactionGroup, compressionGroup, encryptionGroup], true, true);
	}

	private async onAddFilesButtonClicked(): Promise<void> {
	}

	private async onRemoveFilesButtonClicked(): Promise<void> {
	}

	private async onFileRowSelected(): Promise<void> {
	}

	public override async generateScript(): Promise<string> {
		let backupInfo = this.createBackupInfo();
		await this.objectManagementService.backupDatabase(this.options.connectionUri, backupInfo, TaskExecutionMode.script);
		// The backup call will open its own query window, so don't return any script here.
		return undefined;
	}

	public override async saveChanges(contextId: string, object: ObjectManagement.SqlObject): Promise<void> {
		let backupInfo = this.createBackupInfo();
		await this.objectManagementService.backupDatabase(this.options.connectionUri, backupInfo, TaskExecutionMode.execute);
	}

	private getEncryptorOptions(): string[] {
		let options: string[] = [];
		if (this.objectInfo.backupEncryptors) {
			this.objectInfo.backupEncryptors.forEach((encryptor) => {
				let encryptorTypeStr = (encryptor.encryptorType === 0 ? loc.BackupServerCertificate : loc.BackupAsymmetricKey);
				options.push(`${encryptor.encryptorName} (${encryptorTypeStr})`);
			});
		}
		return options;
	}

	private getDefaultFileName(backupType: string): string {
		return `${this.objectInfo.name}-${backupType.replace(' ', '-')}-${new Date().toJSON().slice(0, 19)}`;
	}

	private createBackupInfo(): BackupInfo {
		let encryptorName = '';
		let encryptorType: number | undefined;

		if (this._encryptCheckbox.checked && !isUndefinedOrNull(this._encryptorDropdown.value)) {
			let selectedEncryptor = this._encryptorDropdown.value as string;
			let encryptorTypeStr = selectedEncryptor.substring(selectedEncryptor.lastIndexOf('(') + 1, selectedEncryptor.lastIndexOf(')'));
			encryptorType = (encryptorTypeStr === loc.BackupServerCertificate ? 0 : 1);
			encryptorName = selectedEncryptor.substring(0, selectedEncryptor.lastIndexOf('('));
		}

		let filePaths = this.getBackupFilePaths();
		let isFormatChecked = this._overwriteExistingMediaButton.checked || this._newMediaButton.checked;
		let backupInfo: BackupInfo = {
			databaseName: this.objectInfo.name,
			backupType: this.getBackupTypeNumber(),
			backupComponent: 0,
			backupDeviceType: this.getBackupDeviceType(),
			backupPathList: filePaths,
			selectedFiles: undefined,
			backupsetName: this._backupNameInput.value,
			selectedFileGroup: undefined,
			backupPathDevices: this.getBackupTypePairs(filePaths),
			isCopyOnly: this._copyBackupCheckbox.checked,

			// Get advanced options
			formatMedia: isFormatChecked,
			initialize: isFormatChecked,
			skipTapeHeader: isFormatChecked!,
			mediaName: (isFormatChecked ? this._mediaNameInput.value : ''),
			mediaDescription: (isFormatChecked ? this._mediaDescriptionInput.value : ''),
			checksum: this._checksumCheckbox.checked,
			continueAfterError: this._continueOnErrorCheckbox.checked,
			logTruncation: this._truncateLogButton.checked,
			tailLogBackup: this._backupLogTailButton.checked,
			compressionOption: (this._compressionTypeDropdown.values as string[]).indexOf(this._compressionTypeDropdown.value as string),
			verifyBackupRequired: this._verifyCheckbox.checked,
			encryptionAlgorithm: (this._encryptCheckbox.checked ? (this._algorithmDropdown.values as string[]).indexOf(this._algorithmDropdown.value as string) : 0),
			encryptorType: encryptorType,
			encryptorName: encryptorName
		};

		return backupInfo;
	}

	private getBackupTypeNumber(): number {
		let backupType: number;
		switch (this._backupTypeDropdown.value) {
			case loc.BackupFull:
				backupType = 0;
				break;
			case loc.BackupDifferential:
				backupType = 1;
				break;
			case loc.BackupTransactionLog:
				backupType = 2;
				break;
		}
		return backupType;
	}

	private getBackupDeviceType(): number {
		if (this._backupTypeDropdown.value === loc.BackupUrlLabel) {
			return PhysicalDeviceType.Url;
		}
		return PhysicalDeviceType.Disk;
	}

	private getBackupTypePairs(filePaths: string[]): { [path: string]: number } {
		let pathDeviceMap: { [path: string]: number } = {};
		let deviceType = this.getBackupDeviceType();
		filePaths.forEach(path => {
			pathDeviceMap[path] = deviceType;
		});
		return pathDeviceMap;
	}

	private getBackupFilePaths(): string[] {
		return this._backupFilesTable.data.map(row => row[0] as string);
	}
}

// const maxDevices: number = 64;

const aes128 = 'AES 128';
const aes192 = 'AES 192';
const aes256 = 'AES 256';
const tripleDES = 'Triple DES';

enum PhysicalDeviceType {
	Disk = 2,
	FloppyA = 3,
	FloppyB = 4,
	Tape = 5,
	Pipe = 6,
	CDRom = 7,
	Url = 9,
	Unknown = 100
}
