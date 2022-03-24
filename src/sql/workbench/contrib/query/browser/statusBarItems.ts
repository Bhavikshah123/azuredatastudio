/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { parseNumAsTimeString } from 'sql/platform/connection/common/utils';
import { QueryEditorInput } from 'sql/workbench/common/editor/query/queryEditorInput';
import { QueryEditor } from 'sql/workbench/contrib/query/browser/queryEditor';
import { INotebookService } from 'sql/workbench/services/notebook/browser/notebookService';
import { ICellValue } from 'sql/workbench/services/query/common/query';
import { IQueryModelService } from 'sql/workbench/services/query/common/queryModel';
import QueryRunner from 'sql/workbench/services/query/common/queryRunner';
import { IntervalTimer } from 'vs/base/common/async';
import { Event } from 'vs/base/common/event';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { localize } from 'vs/nls';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IStatusbarEntryAccessor, IStatusbarService, StatusbarAlignment } from 'vs/workbench/services/statusbar/common/statusbar';

export class TimeElapsedStatusBarContributions extends Disposable implements IWorkbenchContribution {

	private static readonly ID = 'status.query.timeElapsed';

	private statusItem: IStatusbarEntryAccessor;
	private intervalTimer = new IntervalTimer();

	private disposable = this._register(new DisposableStore());
	private readonly name = localize('status.query.timeElapsed', "Time Elapsed");

	constructor(
		@IStatusbarService private readonly statusbarService: IStatusbarService,
		@IEditorService private readonly editorService: IEditorService,
		@IQueryModelService private readonly queryModelService: IQueryModelService
	) {
		super();
		this.statusItem = this._register(
			this.statusbarService.addEntry({
				name: this.name,
				text: '',
				ariaLabel: ''
			},
				TimeElapsedStatusBarContributions.ID,
				StatusbarAlignment.RIGHT, 100)
		);

		this._register(editorService.onDidActiveEditorChange(this.update, this));
		this.update();
	}

	private hide() {
		this.statusbarService.updateEntryVisibility(TimeElapsedStatusBarContributions.ID, false);
	}

	private show() {
		this.statusbarService.updateEntryVisibility(TimeElapsedStatusBarContributions.ID, true);
	}

	private update() {
		this.intervalTimer.cancel();
		this.disposable.clear();
		this.hide();
		const activeInput = this.editorService.activeEditor;
		if (activeInput && activeInput instanceof QueryEditorInput && activeInput.uri) {
			const uri = activeInput.uri;
			const runner = this.queryModelService.getQueryRunner(uri);
			if (runner) {
				if (runner.hasCompleted || runner.isExecuting) {
					this._displayValue(runner);
				}
				this.disposable.add(runner.onQueryStart(e => {
					this._displayValue(runner);
				}));
				this.disposable.add(runner.onQueryEnd(e => {
					this._displayValue(runner);
				}));
			} else {
				this.disposable.add(this.queryModelService.onRunQueryStart(e => {
					if (e === uri) {
						this._displayValue(this.queryModelService.getQueryRunner(uri));
					}
				}));
				this.disposable.add(this.queryModelService.onRunQueryComplete(e => {
					if (e === uri) {
						this._displayValue(this.queryModelService.getQueryRunner(uri));
					}
				}));
			}
		}
	}

	private _displayValue(runner: QueryRunner) {
		this.intervalTimer.cancel();
		if (runner.isExecuting) {
			this.intervalTimer.cancelAndSet(() => {
				const value = runner.queryStartTime ? Date.now() - runner.queryStartTime.getTime() : 0;
				const timeString = parseNumAsTimeString(value, false);
				this.statusItem.update({
					name: this.name,
					text: timeString,
					ariaLabel: timeString
				});
			}, 1000);

			const value = runner.queryStartTime ? Date.now() - runner.queryStartTime.getTime() : 0;
			const timeString = parseNumAsTimeString(value, false);
			this.statusItem.update({
				name: this.name,
				text: timeString,
				ariaLabel: timeString
			});
		} else {
			const value = runner.queryStartTime && runner.queryEndTime
				? runner.queryEndTime.getTime() - runner.queryStartTime.getTime() : 0;
			const timeString = parseNumAsTimeString(value, false);
			this.statusItem.update({
				name: this.name,
				text: timeString,
				ariaLabel: timeString
			});
		}
		this.show();
	}
}

export class RowCountStatusBarContributions extends Disposable implements IWorkbenchContribution {

	private static readonly ID = 'status.query.rowCount';

	private statusItem: IStatusbarEntryAccessor;

	private disposable = this._register(new DisposableStore());
	private readonly name = localize('status.query.rowCount', "Row Count");

	constructor(
		@IStatusbarService private readonly statusbarService: IStatusbarService,
		@IEditorService private readonly editorService: IEditorService,
		@IQueryModelService private readonly queryModelService: IQueryModelService
	) {
		super();
		this.statusItem = this._register(
			this.statusbarService.addEntry({
				name: this.name,
				text: '',
				ariaLabel: ''
			},
				RowCountStatusBarContributions.ID,
				StatusbarAlignment.RIGHT, 100)
		);

		this._register(editorService.onDidActiveEditorChange(this.update, this));
		this.update();
	}

	private hide() {
		this.statusbarService.updateEntryVisibility(RowCountStatusBarContributions.ID, false);
	}

	private show() {
		this.statusbarService.updateEntryVisibility(RowCountStatusBarContributions.ID, true);
	}

	private update() {
		this.disposable.clear();
		this.hide();
		const activeInput = this.editorService.activeEditor;
		if (activeInput && activeInput instanceof QueryEditorInput && activeInput.uri) {
			const uri = activeInput.uri;
			const runner = this.queryModelService.getQueryRunner(uri);
			if (runner) {
				if (runner.hasCompleted || runner.isExecuting) {
					this._displayValue(runner);
				}
				this.disposable.add(runner.onQueryStart(e => {
					this._displayValue(runner);
				}));
				this.disposable.add(runner.onResultSetUpdate(e => {
					this._displayValue(runner);
				}));
				this.disposable.add(runner.onQueryEnd(e => {
					this._displayValue(runner);
				}));
			} else {
				this.disposable.add(this.queryModelService.onRunQueryStart(e => {
					if (e === uri) {
						this._displayValue(this.queryModelService.getQueryRunner(uri));
					}
				}));
				this.disposable.add(this.queryModelService.onRunQueryUpdate(e => {
					if (e === uri) {
						this._displayValue(this.queryModelService.getQueryRunner(uri));
					}
				}));
				this.disposable.add(this.queryModelService.onRunQueryComplete(e => {
					if (e === uri) {
						this._displayValue(this.queryModelService.getQueryRunner(uri));
					}
				}));
			}
		}
	}

	private _displayValue(runner: QueryRunner): void {
		const rowCount = runner.batchSets.reduce((p, c) => {
			const cnt = c.resultSetSummaries?.reduce((rp, rc) => {
				return rp + rc.rowCount;
			}, 0) ?? 0;
			return p + cnt;
		}, 0);
		const text = localize('rowCount', "{0} rows", rowCount.toLocaleString());
		this.statusItem.update({ name: this.name, text: text, ariaLabel: text });
		this.show();
	}
}

export class QueryStatusStatusBarContributions extends Disposable implements IWorkbenchContribution {

	private static readonly ID = 'status.query.status';

	private visisbleUri: string | undefined;

	constructor(
		@IStatusbarService private readonly statusbarService: IStatusbarService,
		@IEditorService private readonly editorService: IEditorService,
		@IQueryModelService private readonly queryModelService: IQueryModelService
	) {
		super();
		this._register(
			this.statusbarService.addEntry({
				name: localize('status.query.status', "Execution Status"),
				text: localize('query.status.executing', "Executing query..."),
				ariaLabel: localize('query.status.executing', "Executing query...")
			},
				QueryStatusStatusBarContributions.ID,
				StatusbarAlignment.RIGHT, 100)
		);

		this._register(Event.filter(this.queryModelService.onRunQueryStart, uri => uri === this.visisbleUri)(this.update, this));
		this._register(Event.filter(this.queryModelService.onRunQueryComplete, uri => uri === this.visisbleUri)(this.update, this));
		this._register(this.editorService.onDidActiveEditorChange(this.update, this));
		this.update();
	}

	private update() {
		this.hide();
		this.visisbleUri = undefined;
		const activeInput = this.editorService.activeEditor;
		if (activeInput && activeInput instanceof QueryEditorInput && activeInput.uri) {
			this.visisbleUri = activeInput.uri;
			const runner = this.queryModelService.getQueryRunner(this.visisbleUri);
			if (runner && runner.isExecuting) {
				this.show();
			}
		}
	}

	private hide() {
		this.statusbarService.updateEntryVisibility(QueryStatusStatusBarContributions.ID, false);
	}

	private show() {
		this.statusbarService.updateEntryVisibility(QueryStatusStatusBarContributions.ID, true);
	}
}

export class QueryResultSelectionSummaryStatusBarContribution extends Disposable implements IWorkbenchContribution {
	private static readonly ID = 'status.query.selection-summary';
	private statusItem: IStatusbarEntryAccessor;
	private readonly name = localize('status.query.selection-summary', "Selection Summary");

	constructor(
		@IStatusbarService private readonly statusbarService: IStatusbarService,
		@IEditorService editorService: IEditorService,
		@IQueryModelService queryModelService: IQueryModelService,
		@INotebookService notebookService: INotebookService
	) {
		super();
		this.statusItem = this._register(
			this.statusbarService.addEntry({
				name: this.name,
				text: '',
				ariaLabel: ''
			},
				QueryResultSelectionSummaryStatusBarContribution.ID,
				StatusbarAlignment.RIGHT, 100)
		);
		this._register(editorService.onDidActiveEditorChange(() => { this.hide(); }, this));
		this._register(queryModelService.onRunQueryStart(() => { this.hide(); }));
		this._register(notebookService.onCodeCellExecutionStart(() => { this.hide(); }));
		this._register(queryModelService.onCellSelectionChanged((selectedCells: ICellValue[]) => {
			this.onCellSelectionChanged(selectedCells);
		}));
	}

	private hide(): void {
		this.statusbarService.updateEntryVisibility(QueryResultSelectionSummaryStatusBarContribution.ID, false);
	}

	private show(): void {
		this.statusbarService.updateEntryVisibility(QueryResultSelectionSummaryStatusBarContribution.ID, true);
	}

	private onCellSelectionChanged(selectedCells: ICellValue[]): void {
		const numericValues = selectedCells?.map(cell => cell.invariantCultureDisplayValue || cell.displayValue).filter(value => !Number.isNaN(Number(value))).map(value => Number(value));
		if (numericValues?.length < 2) {
			this.hide();
			return;
		}

		const sum = numericValues.reduce((previous, current, idx, array) => previous + current);
		const summaryText = localize('status.query.summaryText', "Average: {0}  Count: {1}  Sum: {2}", Number((sum / numericValues.length).toFixed(3)), selectedCells.length, sum);
		this.statusItem.update({
			name: this.name,
			text: summaryText,
			ariaLabel: summaryText
		});
		this.show();
	}
}

export class QueryResultsEditorOutputModeStatusBarContribution extends Disposable implements IWorkbenchContribution {

	private static readonly ID = 'status.query.editor-output-mode';
	private readonly name = localize('status.query.editor-output-mode', 'Results to File');

	constructor(
		@IStatusbarService private readonly statusbarService: IStatusbarService,
		@IEditorService private readonly editorService: IEditorService
	) {
		super();
		this._register(
			this.statusbarService.addEntry({
				name: this.name,
				text: localize('query.status.editor-output-status', "Results to File"),
				ariaLabel: localize('query.status.editor-output-status', "Results to File")
			},
				QueryResultsEditorOutputModeStatusBarContribution.ID,
				StatusbarAlignment.RIGHT, 100)
		);

		this._register(this.editorService.onDidActiveEditorChange(this.update, this));
		this._register(this.editorService.onDidActiveEditorOutputModeChange(this.update, this));
		this.update();
	}

	private update() {
		this.hide();

		let editor = this.editorService.activeEditorPane as QueryEditor;
		if (editor?.queryResultsWriterStatus.isWritingToFIle()) {
			this.show();
		}
		else {
			this.hide();
		}
	}

	private hide() {
		this.statusbarService.updateEntryVisibility(QueryResultsEditorOutputModeStatusBarContribution.ID, false);
	}

	private show() {
		this.statusbarService.updateEntryVisibility(QueryResultsEditorOutputModeStatusBarContribution.ID, true);
	}
}
