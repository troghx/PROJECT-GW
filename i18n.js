(function () {
  'use strict';

  const STORAGE_KEY = 'crm_lang';
  const DEFAULT_LANG = 'en';

  // ─── Diccionarios ───
  const dict = {
    en: {
      // Toolbar
      'nav.leads': 'Leads',
      'nav.calendar': 'Calendar',
      'nav.notifs': 'Notifs',
      'nav.emails': 'Emails',
      'nav.search': 'Search client...',
      'nav.clearSearch': 'Clear search',
      'nav.showAccess': 'Show shortcuts',
      'nav.account': 'Account',
      'nav.quickSettings': 'Quick settings',
      'nav.changeTheme': 'Change theme',
      'nav.themeToggle': 'Theme toggle',
      'nav.themeColor': 'Theme color',
      'nav.manageUsers': 'Manage users',
      'nav.logout': 'Log out',

      // Lead header
      'lead.applicant': 'APPLICANT',
      'lead.coApplicant': 'CO-APPLICANT',
      'lead.toggleApplicant': 'Switch to Co-Applicant',
      'lead.toggleCoApplicant': 'Switch to Applicant',
      'lead.caseId': 'Case ID:',
      'lead.copyCaseId': 'Copy Case ID',
      'lead.assignedTo': 'ASSIGNED TO',
      'lead.searchAgent': 'Search agent...',
      'lead.viewAgents': 'View agents',
      'lead.confirmAssign': 'Confirm assignment',
      'lead.pullCredit': 'Pull Credit',

      // Lead tabs
      'tab.lead': 'Lead',
      'tab.creditors': 'Creditors',
      'tab.budget': 'Budget',
      'tab.calculator': 'Calculator',
      'tab.banking': 'Banking',

      // Lead form fields
      'field.firstName': 'First Name',
      'field.middleName': 'Middle Name',
      'field.lastName': 'Last Name',
      'field.dob': 'Date of Birth',
      'field.ssn': 'SSN',
      'field.phone': 'Phone',
      'field.email': 'Email',
      'field.address': 'Address',
      'field.city': 'City',
      'field.state': 'State',
      'field.zip': 'ZIP Code',
      'field.language': 'Language',
      'field.notes': 'Notes',

      // Action buttons
      'action.call': 'Call',
      'action.sendEmail': 'Send Email',
      'action.files': 'Files',
      'action.notes': 'Notes',
      'action.save': 'Save',
      'action.cancel': 'Cancel',
      'action.delete': 'Delete',
      'action.edit': 'Edit',
      'action.close': 'Close',
      'action.add': 'Add',
      'action.use': 'Use',

      // Files panel
      'files.title': 'Files',
      'files.close': 'Close files',
      'files.dropzone': 'Drag files here or click to select (classification required)',
      'files.empty': 'No files yet',
      'files.emptySub': 'Uploaded files will appear here',

      // Email panel
      'email.title': 'Emails',
      'email.close': 'Close emails',
      'email.compose': 'Compose new email',
      'email.composeSub': 'Open compose for this lead',
      'email.genContract': 'Generate contract',
      'email.genContractSub': 'Create contract PDF in Files',

      // Notes panel
      'notes.title': 'Notes',
      'notes.close': 'Close notes',
      'notes.new': 'New note',
      'notes.placeholder': 'Write a note and press Add...',
      'notes.add': 'Add note',
      'notes.empty': 'No notes',
      'notes.templates': 'Templates',
      'notes.selectTemplate': 'Select template...',
      'notes.editTemplates': 'Edit my templates',

      // Budget
      'budget.workspace': 'BUDGET WORKSPACE',
      'budget.items': 'Budget Items',
      'budget.income': 'Income',
      'budget.hardship': 'Hardship',
      'budget.save': 'Save Budget',
      'budget.noChanges': 'No changes',
      'budget.saving': 'Saving...',
      'budget.saved': 'Saved',
      'budget.hardshipReason': 'Hardship Reason',
      'budget.selectReason': 'Select reason...',
      'budget.detailEs': 'Detailed Hardship Reason (Español)',
      'budget.detailEn': 'Detailed Hardship Reason (English)',
      'budget.placeholderEs': 'Describe the situation in Spanish...',
      'budget.placeholderEn': 'Describe the situation in English...',

      // Status messages
      'status.loading': 'Loading...',
      'status.loadingClient': 'Loading client information...',
      'status.saving': 'Saving...',
      'status.saved': 'Saved successfully',
      'status.error': 'An error occurred',
      'status.noChanges': 'No changes',
      'status.searchStatus': 'Search status...',

      // Validation
      'val.requiredFields': 'Please complete all required fields.',
      'val.invalidPhone': 'Enter a valid 10-digit phone (e.g.: 305-555-0123).',
      'val.selectState': 'Please select a state.',
      'val.createError': 'Could not create the lead. Try again.',

      // Confirms
      'confirm.deleteTask': 'Delete event',
      'confirm.deleteLead': 'Are you sure you want to delete the lead',
      'confirm.cantUndo': 'This action cannot be undone.',

      // Empty states
      'empty.notifs': 'not a single cricket around here zzzz',
      'empty.noLead': 'No lead selected.',
      'empty.noNotes': 'No notes yet. Create one for your to-do.',
      'empty.noMatch': 'No matches',
      'empty.noUsers': 'No users in this category.',
      'empty.noTasks': 'No tasks for this date.',

      // Misc
      'misc.newCallback': 'New callback',
      'misc.newTask': 'New task',
      'misc.editUser': 'Edit user',
      'misc.newUser': 'New user',
      'misc.customRange': 'Custom range',
      'misc.selected': 'selected',
      'misc.noUser': 'No user',
      'misc.leadSelected': 'Lead selected:',

      // Toast messages — Users
      'toast.permissionUpdated': 'Permission updated.',
      'toast.permissionError': 'Could not update the permission.',
      'toast.cantDemoteSelf': 'You cannot demote your own admin user.',
      'toast.roleUpdated': 'Role updated to',
      'toast.roleUpdateError': 'Could not update the user role.',
      'toast.pinRequired': 'PIN is required to create a user.',
      'toast.userUpdated': 'User updated.',
      'toast.userCreated': 'User created.',
      'toast.userSaveError': 'Could not save the user.',

      // Toast messages — Schedule
      'toast.noTaskPermission': 'You do not have permission to create tasks.',
      'toast.noEventOwner': 'Could not determine the event owner.',
      'toast.invalidDate': 'Select a valid date on the calendar.',
      'toast.emptyTitle': 'The title cannot be empty.',
      'toast.eventCreated': 'Event created successfully.',
      'toast.eventCreateError': 'Could not create the event.',
      'toast.selectUserSchedule': 'Select a specific user schedule to create an event.',
      'toast.postItLimit': 'Limit of 42 post-its reached.',
      'toast.taskCompleted': 'Task marked as completed.',
      'toast.taskCompleteError': 'Could not mark the task as completed.',
      'toast.onlyAdminDelete': 'Only admin/sup can delete schedule events.',
      'toast.eventDeleted': 'Event deleted successfully.',
      'toast.eventDeleteError': 'Could not delete the event.',

      // Toast messages — Emails
      'toast.noEmailDeletePerm': 'You do not have permission to delete emails.',
      'toast.emailDeleted': 'Email deleted successfully.',
      'toast.selectEmail': 'Select at least one email.',
      'toast.emailsDeleted': 'emails deleted.',
      'toast.emailDeleteError': 'Could not delete the email.',
      'toast.emailsDeleteError': 'Could not delete the emails.',
      'toast.emailsUpdateError': 'Could not update the emails.',

      // Toast messages — Leads
      'toast.leadReassigned': 'Lead reassigned to',
      'toast.leadReassignError': 'Could not reassign the lead.',
      'toast.fileNotFound': 'File not found.',
      'toast.fileOpenError': 'Could not open the file.',
      'toast.leadDeleted': 'Lead deleted successfully',
      'toast.leadDeleteError': 'Error deleting the lead',
      'toast.nothingToCopy': 'Nothing to copy for',
      'toast.copied': 'copied:',
      'toast.copyError': 'Error copying',

      // Confirm dialogs
      'confirm.deleteEvent': 'Delete event',
      'confirm.deleteEmail': 'Delete email',
      'confirm.deleteEmails': 'Delete selected emails?',

      // Login
      'login.enterUser': 'Enter username or email.',
      'login.pinLength': 'PIN must be 6 digits.',
      'login.validating': 'Validating access...',
      'login.noToken': 'No session token received. Contact the administrator.',

      // Filters
      'filter.date': 'Date',
      'filter.customRange': 'Custom range',
      'filter.today': 'Today',
      'filter.last7': 'Last 7 days',
      'filter.last30': 'Last 30 days',
      'filter.last90': 'Last 90 days',

      // Column resize
      'col.resizeHint': 'Drag to resize. Double-click to auto-fit.',

      // Client — Lead assignment
      'client.selectValidUser': 'Select a valid user.',
      'client.leadAssigned': 'Lead assigned to',
      'client.leadAssignError': 'Could not assign the lead.',

      // Client — Applicant toggle
      'client.switchedTo': 'Switched to',
      'client.applicantUpdated': 'updated successfully',
      'client.nameUpdateError': 'Error updating the name',
      'client.dbSaveError': 'Could not save the change to database.',
      'client.leadIdNotFound': 'Error: Lead ID not found',

      // Client — Undo / Audit
      'client.noLeadUndo': 'No active lead to undo.',
      'client.undoSuccess': 'Change undone successfully.',
      'client.undoError': 'Could not undo the change.',
      'client.leadNotSelected': 'Lead not selected.',
      'client.auditLoadError': 'Could not load change history.',
      'client.auditPermission': 'Only admin/sup can view audit.',

      // Client — Notes
      'client.noteLeadError': 'Could not find the active lead to save notes.',
      'client.noteAdded': 'Note added successfully.',
      'client.noteAddError': 'Could not add the note.',
      'client.noteEditError': 'Could not edit the selected note.',
      'client.noteEmpty': 'The note cannot be empty.',
      'client.noteUpdated': 'Note updated successfully.',
      'client.noteUpdateError': 'Could not update the note.',
      'client.noteDeleteSelectError': 'Could not delete the selected note.',
      'client.noteDeleted': 'Note deleted successfully.',
      'client.noteDeleteError': 'Could not delete the note.',
      'client.noteColorError': 'Could not update the note color.',
      'client.noteColorUpdated': 'Note color updated.',
      'client.noteColorUpdateError': 'Could not update the note color.',

      // Client — Templates
      'client.templateNameRequired': 'You must enter a name for the template.',
      'client.templateContentRequired': 'You must enter content for the template.',
      'client.templateCreateError': 'Could not create the template.',
      'client.templateUpdated': 'Template updated.',
      'client.templateUpdateError': 'Could not update the template.',
      'client.templateSelectDelete': 'Select a template to delete.',
      'client.templateDeleted': 'Template deleted.',
      'client.templateDeleteError': 'Could not delete the template.',
      'client.templateSelectApply': 'Select a template to apply.',
      'client.templateApplied': 'Template applied to note.',
      'client.notesLoadError': 'Could not load the notes panel.',
      'client.templatesLoadError': 'Could not open the templates editor.',

      // Client — Fields & Status
      'client.bestTimeUpdated': 'Best time to call updated',
      'client.bestTimeError': 'Could not update Best time to call.',
      'client.statusUpdated': 'Status updated to',
      'client.statusError': 'Could not update the status.',
      'client.fieldUpdated': 'Field updated',
      'client.fieldSaveError': 'Could not save the field.',
      'client.dobUpdated': 'Date of birth updated',
      'client.dobSaveError': 'Could not save the date of birth.',
      'client.calcSyncError': 'Could not sync the calculator.',
      'client.copiedClipboard': 'Copied to clipboard',
      'client.fieldUnlocked': 'Field unlocked',
      'client.fieldLocked': 'Field locked',
      'client.selfEmployedYes': 'Yes',
      'client.selfEmployedNo': 'No',

      // Client — Callback
      'client.selectDate': 'Select date',
      'client.callbackScheduled': 'Callback scheduled for:',
      'client.callbackSaveError': 'Could not save callback.',
      'client.callbackDeleted': 'Callback deleted',
      'client.callbackDeleteError': 'Could not delete callback.',

      // Client — Files
      'client.noLeadSelected': 'No lead selected',
      'client.fileTypeNotAllowed': 'File type not allowed:',
      'client.fileTooLarge': 'File too large:',
      'client.maxSize': '(max 10MB)',
      'client.uploadCancelled': 'Upload cancelled:',
      'client.fileUploaded': 'File uploaded:',
      'client.fileUploadError': 'Could not upload the file.',
      'client.fileSyncError': 'Could not sync files.',
      'client.fileContentNotFound': 'File content not found.',
      'client.fileDeleteError': 'Could not delete the file.',
      'client.fileDeleted': 'File deleted',
      'client.fileNotFound': 'File not found',
      'client.selectFileType': 'You must select the file type.',
      'client.selectApplicantType': 'Select if the debt is from Applicant or Co-Applicant.',

      // Client — Email & Contract
      'client.sendEmail': 'Send email',
      'client.sending': 'Sending...',
      'client.generatingContract': 'Generating contract...',
      'client.creatingPdf': 'Creating PDF in Files',
      'client.openContract': 'Open contract',
      'client.previewContract': 'Preview the contract',
      'client.sendContract': 'Send contract',
      'client.noLeadContract': 'No active lead to generate contract.',
      'client.contractGenerated': 'Contract generated successfully.',
      'client.contractGenError': 'Could not generate the contract.',
      'client.invalidRecipient': 'The recipient does not have a valid email.',
      'client.checkCc': 'Check the CC emails.',
      'client.subjectRequired': 'You must enter a subject.',
      'client.bodyRequired': 'You must enter the email body.',
      'client.emailSent': 'Email sent successfully.',
      'client.emailSendError': 'Could not send the email.',
      'client.noClientEmail': 'The client does not have a registered email.',
      'client.addSubject': 'Add a subject for the email.',
      'client.contractSavedPending': 'Contract saved in Files. Email sending pending integration.',
      'client.contractSendError': 'Could not send the contract.',

      // Client — Credit
      'client.pullCreditInfo': 'Complete Contact Info, City and ZIP Code before Pull Credit.',

      // Client — Misc
      'client.noMatch': 'No matches',
      'client.relatedWith': 'Related to #',
      'client.totalDebtUpdated': 'Total Debt updated from Creditors:',
      'client.dateSyncError': 'Could not sync the date on the server',
      'client.firstDeposit': 'First deposit:',
      'client.selfEmployed': 'Self Employed:',
      'client.selfEmployedError': 'Could not update Self Employed.',
      'client.notesLoadError': 'Could not load the notes.',

      // Additional shared UI
      'action.clear': 'Clear',
      'action.copy': 'Copy',
      'action.download': 'Download',
      'action.open': 'Open',
      'common.applicant': 'Applicant',
      'common.coApplicant': 'Co-Applicant',
      'common.system': 'System',
      'common.notAvailable': 'Not available',
      'common.unassigned': 'Unassigned',

      // Login shell
      'login.panelAria': 'Login panel',
      'login.title': 'Sign In',
      'login.identifierLabel': 'Username or email',
      'login.pinLabel': 'PIN (6 digits)',
      'login.pinGroupAria': '6-digit access PIN',
      'login.pinPadAria': 'PIN numeric keypad',
      'login.backspace': 'Delete last digit',
      'login.submit': 'Enter',
      'login.visualAria': 'Inspirational messages',
      'login.quote': 'Like drops of dew feeding the ocean, each small action builds seas of transformation.',

      // Leads view
      'leads.searchPlaceholder': 'Search leads...',
      'leads.status': 'Status',
      'leads.statusSearch': 'Search status...',
      'leads.agent': 'Agent',
      'leads.from': 'From',
      'leads.to': 'To',
      'leads.apply': 'Apply',
      'leads.savedFilters': 'Saved filters',
      'leads.noSavedFilters': 'No saved filters',
      'leads.filterName': 'Filter name',
      'leads.saveCurrentFilters': 'Save current filters',
      'leads.clearFilters': 'Clear filters',
      'leads.newLead': 'New lead',
      'leads.emptyTitle': 'No leads found',
      'leads.emptySubtitle': 'Adjust the filters or create a new lead.',
      'leads.page': 'Page',
      'leads.of': 'of',

      // Calendar view
      'calendar.postIts': 'Post-its',
      'calendar.newNote': 'New note',
      'calendar.postItsSubtitle': 'Quick reminders for your day',
      'calendar.prevMonth': 'Previous month',
      'calendar.nextMonth': 'Next month',
      'calendar.weekdayMon': 'Mon',
      'calendar.weekdayTue': 'Tue',
      'calendar.weekdayWed': 'Wed',
      'calendar.weekdayThu': 'Thu',
      'calendar.weekdayFri': 'Fri',
      'calendar.weekdaySat': 'Sat',
      'calendar.weekdaySun': 'Sun',
      'calendar.agenda': 'Agenda',
      'calendar.searchSchedule': 'Search schedule...',
      'calendar.overdue': 'Overdue',
      'calendar.upcoming': 'Upcoming',
      'calendar.noDateSelected': 'No date selected',
      'calendar.noTasksToShow': 'No tasks to show yet.',
      'calendar.targetAgenda': 'Target agenda',
      'calendar.eventTitle': 'Title',
      'calendar.eventTitlePlaceholder': 'Ex. Document follow-up',
      'calendar.clientOptional': 'Client / Lead (optional)',
      'calendar.clientPlaceholder': 'Search by name, case, phone...',
      'calendar.openSelectedLead': 'Open selected lead',
      'calendar.invalidDate': 'Invalid date',

      // Emails view
      'emails.searchPlaceholder': 'Search emails...',
      'emails.filters': 'Filters',
      'emails.deleteSelected': 'Delete selected',
      'emails.refresh': 'Refresh',
      'emails.all': 'All',
      'emails.sent': 'Sent',
      'emails.failed': 'Failed',
      'emails.pending': 'Pending',
      'emails.fromDate': 'From date',
      'emails.toDate': 'To date',
      'emails.clearFilters': 'Clear filters',
      'emails.adminView': 'Admin view',
      'emails.sellerView': 'Seller view',
      'emails.selectedOne': '1 selected',
      'emails.selectedMany': 'selected',
      'emails.noRelatedLead': 'No related lead',
      'emails.noSubject': 'No subject',
      'emails.emptyTitle': 'No emails to show',
      'emails.emptySubtitle': 'When the platform sends emails, they will appear here.',
      'emails.loadErrorTitle': 'Could not load emails',
      'emails.loadErrorSubtitle': 'Try refreshing again.',
      'emails.sentBy': 'Sent by',
      'emails.relatedRecipient': 'Related / Recipient',
      'emails.subject': 'Subject',
      'emails.recipient': 'Recipient',
      'emails.sentAt': 'Sent at',
      'emails.status': 'Status',
      'emails.actions': 'Actions',
      'emails.selectAll': 'Select all',

      // New lead modal
      'newLead.title': 'New Lead',
      'newLead.test': 'Test',
      'newLead.nameLabel': 'Client name *',
      'newLead.namePlaceholder': 'Ex: John Doe',
      'newLead.phoneLabel': 'Phone number *',
      'newLead.stateLabel': 'State (US)',
      'newLead.statePlaceholder': 'Search state...',
      'newLead.create': 'Create lead',

      // Duplicate lead modal
      'duplicate.title': 'Possible duplicates detected',
      'duplicate.openExisting': 'Open existing',
      'duplicate.createLinked': 'Create and link',
      'duplicate.forceCreate': 'Create anyway',

      // Users admin
      'users.title': 'User management',
      'users.adminOnly': 'Admins only',
      'users.activeUsers': 'Active users',
      'users.newUser': 'New user',
      'users.loading': 'Loading users...',
      'users.username': 'Username',
      'users.displayName': 'Display name',
      'users.role': 'Role',
      'users.pinLabel': 'PIN (6 digits)',
      'users.activeUser': 'Active user',

      // Notifications
      'notif.title': 'Notifications',

      // Lead detail
      'lead.changeStatus': 'Change status',
      'lead.selectStatus': 'Select status',
      'lead.openRelated': 'Open related lead',

      // Calculator
      'calc.configuration': 'Configuration',
      'calc.totalDebt': 'Total debt',
      'calc.copyTotalDebt': 'Copy total debt',
      'calc.estimatedSettlement': 'Estimated settlement',
      'calc.programFee': 'Program fee',
      'calc.monthlyBankFee': 'Monthly bank fee',
      'calc.legalPlan': 'Legal plan',
      'calc.includeLegal': 'Include legal plan',
      'calc.paymentFrequency': 'Payment frequency',
      'calc.monthly': 'Monthly',
      'calc.biMonthly': 'Twice a month',
      'calc.biWeekly': 'Bi-weekly',
      'calc.paymentDay': 'Payment day',

      // Budget
      'budget.applicantIncome': 'Applicant income',
      'budget.coApplicantIncome': 'Co-Applicant income',
      'budget.details': 'Details',

      // Notes and templates
      'notes.myTemplates': 'My templates',
      'notes.noteActions': 'Note actions',
      'notes.emptyState': 'There are no notes on this lead yet.',
      'notes.noneStatus': 'No notes',
      'notes.selectLeadStatus': 'Select a lead',
      'notes.loading': 'Loading notes...',
      'notes.readyToAdd': 'Write the note and press Add note again.',
      'notes.writeBeforeAdd': 'Write a note before adding it.',
      'notes.adding': 'Adding note...',
      'notes.templateAppliedStatus': 'Template applied. Press Add note to save it.',
      'notes.templatesListAria': 'Templates list',
      'template.name': 'Name',
      'template.namePlaceholder': 'Ex: Initial contact',
      'template.content': 'Content',
      'template.contentPlaceholder': 'Write the template content...',
      'template.saveAsNew': 'Save as new',
      'template.to': 'To',
      'template.cc': 'CC',
      'template.subject': 'Subject',
      'template.message': 'Message',

      // Schedule
      'schedule.deletePostIt': 'Delete post-it',
      'schedule.writeSomething': 'Write something...',
      'schedule.completed': 'Completed',
      'schedule.inProgress': 'In progress',
      'schedule.escalated': 'Escalated',
      'schedule.pending': 'Pending',
      'schedule.todayTag': 'TODAY',
      'schedule.case': 'Case',
      'schedule.caseNoId': 'Case without ID',
      'schedule.openLead': 'Open lead',
      'schedule.markCompleted': 'Mark completed',
      'schedule.deleting': 'Deleting...',
      'schedule.moreActions': 'More actions',
      'schedule.overdue': 'Overdue',
      'schedule.teamEmptyOwner': 'Select a team member to see their agenda.',
      'schedule.teamEmpty': 'There are no tasks for this team selection.',
      'schedule.mineEmpty': 'You have no tasks for this date.',
      'schedule.selectedDate': 'Selected date',
      'schedule.completedSection': 'Completed',
      'schedule.taskLabel': 'Task',
      'schedule.callbackLabel': 'Callback',

      // Files
      'files.categoryOfficialDocument': 'Official document',
      'files.categoryCreditReport': 'Credit report',
      'files.categoryIncomeProof': 'Proof of income',
      'files.categoryBankStatement': 'Bank statement',
      'files.categoryContract': 'Contract',
      'files.categoryOther': 'Other',
      'files.categoryUnclassified': 'Unclassified',
      'files.classifyTitle': 'Classify file',
      'files.classifyFile': 'File',
      'files.fileType': 'File type',
      'files.selectType': 'Select type...',
      'files.debtBelongsTo': 'Debt belongs to',
      'files.selectParty': 'Select party...',
      'files.noLeadFiles': 'This lead has no uploaded files.',
      'files.typeUndefined': 'undefined type',
      'files.previewTitle': 'Preview',
      'files.viewerClose': 'Close preview',

      // Prompts and confirms
      'prompt.editNote': 'Edit note:',
      'confirm.deleteNote': 'Delete this note?',
      'confirm.deleteFile': 'Delete this file?',

      // Additional client actions
      'client.includeCoappOn': 'Include Co-Applicant in contract enabled.',
      'client.includeCoappOff': 'Include Co-Applicant in contract disabled.',
      'client.zipUpdated': 'ZIP updated:',
      'client.totalDebtCopied': 'Total debt copied:',
      'client.clickToLock': 'Click to lock field',
      'client.clickToUnlock': 'Click to unlock field',
      'client.clientPhone': 'Client phone',
      'client.clientEmail': 'Client email',
      'client.contractGeneratedTitle': 'Generated contract',
      'client.pullCreditChoose': 'Choose who to run the credit pull for.',
      'client.completeCoapp': 'Complete co-applicant data to enable.',
      'client.regenerateContract': 'Regenerate contract',
      'client.regeneratingContract': 'Regenerating...',
      'client.contractLoadingWait': 'Generating contract, please wait...',
      'client.contractPreviewLoadError': 'The contract was generated, but the preview could not be loaded.',
      'client.noContractPreview': 'There is no contract to display yet.',
      'client.emailRegisterError': 'Could not register the email.',
      'client.noLeadEmail': 'There is no active lead to send email.',
      'client.fileReadError': 'Could not read the file.',
      'client.fileReadDbError': 'Could not read the file from local storage.',
      'client.fileLocalSaveLimit': 'Could not save the file locally because the storage limit was reached.',
      'client.templateCreated': 'Template created successfully.',
      'client.templateSavedAsNew': 'Template saved as new.',
      'client.notesActionError': 'Could not complete the notes action.',
      'client.templatesActionError': 'Could not complete the templates action.',

      // Lang toggle
      'lang.label': 'EN',
      'lang.title': 'Switch to Spanish',
    },

    es: {
      // Toolbar
      'nav.leads': 'Leads',
      'nav.calendar': 'Calendario',
      'nav.notifs': 'Notifs',
      'nav.emails': 'Correos',
      'nav.search': 'Buscar cliente...',
      'nav.clearSearch': 'Limpiar búsqueda',
      'nav.showAccess': 'Mostrar accesos',
      'nav.account': 'Cuenta',
      'nav.quickSettings': 'Ajustes rápidos',
      'nav.changeTheme': 'Cambiar tema',
      'nav.themeToggle': 'Toggle de tema',
      'nav.themeColor': 'Color del tema',
      'nav.manageUsers': 'Gestionar usuarios',
      'nav.logout': 'Cerrar sesión',

      // Lead header
      'lead.applicant': 'APPLICANT',
      'lead.coApplicant': 'CO-APPLICANT',
      'lead.toggleApplicant': 'Cambiar a Co-Applicant',
      'lead.toggleCoApplicant': 'Cambiar a Applicant',
      'lead.caseId': 'Case ID:',
      'lead.copyCaseId': 'Copiar Case ID',
      'lead.assignedTo': 'ASSIGNED TO',
      'lead.searchAgent': 'Buscar agente...',
      'lead.viewAgents': 'Ver agentes',
      'lead.confirmAssign': 'Confirmar asignación',
      'lead.pullCredit': 'Pull Credit',

      // Lead tabs
      'tab.lead': 'Lead',
      'tab.creditors': 'Acreedores',
      'tab.budget': 'Presupuesto',
      'tab.calculator': 'Calculadora',
      'tab.banking': 'Banca',

      // Lead form fields
      'field.firstName': 'Nombre',
      'field.middleName': 'Segundo Nombre',
      'field.lastName': 'Apellido',
      'field.dob': 'Fecha de Nacimiento',
      'field.ssn': 'SSN',
      'field.phone': 'Teléfono',
      'field.email': 'Correo',
      'field.address': 'Dirección',
      'field.city': 'Ciudad',
      'field.state': 'Estado',
      'field.zip': 'Código Postal',
      'field.language': 'Idioma',
      'field.notes': 'Notas',

      // Action buttons
      'action.call': 'Llamar',
      'action.sendEmail': 'Enviar Email',
      'action.files': 'Archivos',
      'action.notes': 'Notas',
      'action.save': 'Guardar',
      'action.cancel': 'Cancelar',
      'action.delete': 'Eliminar',
      'action.edit': 'Editar',
      'action.close': 'Cerrar',
      'action.add': 'Agregar',
      'action.use': 'Usar',

      // Files panel
      'files.title': 'Archivos',
      'files.close': 'Cerrar archivos',
      'files.dropzone': 'Arrastra archivos aquí o haz clic para seleccionar (requiere clasificación)',
      'files.empty': 'No hay archivos aún',
      'files.emptySub': 'Los archivos subidos aparecerán aquí',

      // Email panel
      'email.title': 'Correos',
      'email.close': 'Cerrar correos',
      'email.compose': 'Crear nuevo correo',
      'email.composeSub': 'Abrir redacción para este lead',
      'email.genContract': 'Generar contrato',
      'email.genContractSub': 'Crear PDF del contrato en Files',

      // Notes panel
      'notes.title': 'Notas',
      'notes.close': 'Cerrar notas',
      'notes.new': 'Nueva nota',
      'notes.placeholder': 'Escribe una nota y presiona Agregar...',
      'notes.add': 'Agregar nota',
      'notes.empty': 'Sin notas',
      'notes.templates': 'Templates',
      'notes.selectTemplate': 'Seleccionar template...',
      'notes.editTemplates': 'Editar mis templates',

      // Budget
      'budget.workspace': 'BUDGET WORKSPACE',
      'budget.items': 'Budget Items',
      'budget.income': 'Income',
      'budget.hardship': 'Hardship',
      'budget.save': 'Guardar Budget',
      'budget.noChanges': 'Sin cambios',
      'budget.saving': 'Guardando...',
      'budget.saved': 'Guardado',
      'budget.hardshipReason': 'Hardship Reason',
      'budget.selectReason': 'Seleccionar razón...',
      'budget.detailEs': 'Detailed Hardship Reason (Español)',
      'budget.detailEn': 'Detailed Hardship Reason (English)',
      'budget.placeholderEs': 'Describe la situación en español...',
      'budget.placeholderEn': 'Describe the situation in English...',

      // Status messages
      'status.loading': 'Cargando...',
      'status.loadingClient': 'Cargando información del cliente...',
      'status.saving': 'Guardando...',
      'status.saved': 'Guardado exitosamente',
      'status.error': 'Ocurrió un error',
      'status.noChanges': 'Sin cambios',
      'status.searchStatus': 'Buscar status...',

      // Validation
      'val.requiredFields': 'Por favor completa todos los campos obligatorios.',
      'val.invalidPhone': 'Ingresa un teléfono válido de 10 dígitos (ej: 305-555-0123).',
      'val.selectState': 'Por favor selecciona un estado.',
      'val.createError': 'No se pudo crear el lead. Intenta de nuevo.',

      // Confirms
      'confirm.deleteTask': 'Eliminar evento',
      'confirm.deleteLead': '¿Estás seguro de eliminar el lead',
      'confirm.cantUndo': 'Esta acción no se puede deshacer.',

      // Empty states
      'empty.notifs': 'ni un grillo por estas líneas zzzz',
      'empty.noLead': 'Sin lead seleccionado.',
      'empty.noNotes': 'Sin notas por ahora. Crea una para tu to-do.',
      'empty.noMatch': 'Sin coincidencias',
      'empty.noUsers': 'Sin usuarios en esta categoría.',
      'empty.noTasks': 'No hay tasks para esta fecha.',

      // Misc
      'misc.newCallback': 'Nuevo callback',
      'misc.newTask': 'Nueva task',
      'misc.editUser': 'Editar usuario',
      'misc.newUser': 'Nuevo usuario',
      'misc.customRange': 'Rango custom',
      'misc.selected': 'seleccionado',
      'misc.noUser': 'Sin usuario',
      'misc.leadSelected': 'Lead seleccionado:',

      // Toast messages — Users
      'toast.permissionUpdated': 'Permiso actualizado.',
      'toast.permissionError': 'No se pudo actualizar el permiso.',
      'toast.cantDemoteSelf': 'No puedes degradar tu propio usuario admin.',
      'toast.roleUpdated': 'Rol actualizado a',
      'toast.roleUpdateError': 'No se pudo actualizar el rol del usuario.',
      'toast.pinRequired': 'PIN obligatorio para crear usuario.',
      'toast.userUpdated': 'Usuario actualizado.',
      'toast.userCreated': 'Usuario creado.',
      'toast.userSaveError': 'No se pudo guardar el usuario.',

      // Toast messages — Schedule
      'toast.noTaskPermission': 'No tienes permisos para crear tareas.',
      'toast.noEventOwner': 'No se pudo determinar el usuario dueño del evento.',
      'toast.invalidDate': 'Selecciona una fecha válida en el calendario.',
      'toast.emptyTitle': 'El título no puede quedar vacío.',
      'toast.eventCreated': 'Evento creado correctamente.',
      'toast.eventCreateError': 'No se pudo crear el evento.',
      'toast.selectUserSchedule': 'Selecciona una agenda de usuario específico para crearle un evento.',
      'toast.postItLimit': 'Límite de 42 post-its alcanzado.',
      'toast.taskCompleted': 'Task marcada como completada.',
      'toast.taskCompleteError': 'No se pudo marcar la task como completada.',
      'toast.onlyAdminDelete': 'Solo admin/sup puede eliminar eventos de agenda.',
      'toast.eventDeleted': 'Evento eliminado correctamente.',
      'toast.eventDeleteError': 'No se pudo eliminar el evento.',

      // Toast messages — Emails
      'toast.noEmailDeletePerm': 'No tienes permisos para eliminar correos.',
      'toast.emailDeleted': 'Correo eliminado correctamente.',
      'toast.selectEmail': 'Selecciona al menos un correo.',
      'toast.emailsDeleted': 'correos eliminados.',
      'toast.emailDeleteError': 'No se pudo eliminar el correo.',
      'toast.emailsDeleteError': 'No se pudieron eliminar los correos.',
      'toast.emailsUpdateError': 'No se pudieron actualizar los correos.',

      // Toast messages — Leads
      'toast.leadReassigned': 'Lead reasignado a',
      'toast.leadReassignError': 'No se pudo reasignar el lead.',
      'toast.fileNotFound': 'Archivo no encontrado.',
      'toast.fileOpenError': 'No se pudo abrir el archivo.',
      'toast.leadDeleted': 'Lead eliminado correctamente',
      'toast.leadDeleteError': 'Error al eliminar el lead',
      'toast.nothingToCopy': 'No hay para copiar:',
      'toast.copied': 'copiado:',
      'toast.copyError': 'Error al copiar',

      // Confirm dialogs
      'confirm.deleteEvent': 'Eliminar evento',
      'confirm.deleteEmail': 'Eliminar correo',
      'confirm.deleteEmails': '¿Eliminar correos seleccionados?',

      // Login
      'login.enterUser': 'Ingresa usuario o correo.',
      'login.pinLength': 'El PIN debe tener 6 dígitos.',
      'login.validating': 'Validando acceso...',
      'login.noToken': 'No se recibió token de sesión. Contacta al administrador.',

      // Filters
      'filter.date': 'Fecha',
      'filter.customRange': 'Rango custom',
      'filter.today': 'Hoy',
      'filter.last7': 'Últimos 7 días',
      'filter.last30': 'Últimos 30 días',
      'filter.last90': 'Últimos 90 días',

      // Column resize
      'col.resizeHint': 'Arrastra para ajustar ancho. Doble clic para autoajustar.',

      // Client — Lead assignment
      'client.selectValidUser': 'Selecciona un usuario válido.',
      'client.leadAssigned': 'Lead asignado a',
      'client.leadAssignError': 'No se pudo asignar el lead.',

      // Client — Applicant toggle
      'client.switchedTo': 'Cambiado a',
      'client.applicantUpdated': 'actualizado correctamente',
      'client.nameUpdateError': 'Error al actualizar el nombre',
      'client.dbSaveError': 'No se pudo guardar el cambio en base de datos.',
      'client.leadIdNotFound': 'Error: No se encontró el ID del lead',

      // Client — Undo / Audit
      'client.noLeadUndo': 'No hay lead activo para deshacer.',
      'client.undoSuccess': 'Cambio deshecho correctamente.',
      'client.undoError': 'No se pudo deshacer el cambio.',
      'client.leadNotSelected': 'Lead no seleccionado.',
      'client.auditLoadError': 'No se pudo cargar historial de cambios.',
      'client.auditPermission': 'Solo admin/sup puede ver auditoría.',

      // Client — Notes
      'client.noteLeadError': 'No se encontró el lead activo para guardar notas.',
      'client.noteAdded': 'Nota agregada correctamente.',
      'client.noteAddError': 'No se pudo agregar la nota.',
      'client.noteEditError': 'No se pudo editar la nota seleccionada.',
      'client.noteEmpty': 'La nota no puede quedar vacía.',
      'client.noteUpdated': 'Nota actualizada correctamente.',
      'client.noteUpdateError': 'No se pudo actualizar la nota.',
      'client.noteDeleteSelectError': 'No se pudo eliminar la nota seleccionada.',
      'client.noteDeleted': 'Nota eliminada correctamente.',
      'client.noteDeleteError': 'No se pudo eliminar la nota.',
      'client.noteColorError': 'No se pudo actualizar el color de la nota.',
      'client.noteColorUpdated': 'Color de nota actualizado.',
      'client.noteColorUpdateError': 'No se pudo actualizar el color de la nota.',

      // Client — Templates
      'client.templateNameRequired': 'Debes escribir un nombre para el template.',
      'client.templateContentRequired': 'Debes escribir contenido para el template.',
      'client.templateCreateError': 'No se pudo crear el template.',
      'client.templateUpdated': 'Template actualizado.',
      'client.templateUpdateError': 'No se pudo actualizar el template.',
      'client.templateSelectDelete': 'Selecciona un template para eliminar.',
      'client.templateDeleted': 'Template eliminado.',
      'client.templateDeleteError': 'No se pudo eliminar el template.',
      'client.templateSelectApply': 'Selecciona un template para aplicar.',
      'client.templateApplied': 'Template aplicado a la nota.',
      'client.notesLoadError': 'No se pudo cargar el panel de notas.',
      'client.templatesLoadError': 'No se pudo abrir el editor de templates.',

      // Client — Fields & Status
      'client.bestTimeUpdated': 'Best time to call actualizado',
      'client.bestTimeError': 'No se pudo actualizar Best time to call.',
      'client.statusUpdated': 'Status actualizado a',
      'client.statusError': 'No se pudo actualizar el status.',
      'client.fieldUpdated': 'Campo actualizado',
      'client.fieldSaveError': 'No se pudo guardar el campo.',
      'client.dobUpdated': 'Fecha de nacimiento actualizada',
      'client.dobSaveError': 'No se pudo guardar la fecha de nacimiento.',
      'client.calcSyncError': 'No se pudo sincronizar la calculadora.',
      'client.copiedClipboard': 'Copiado al portapapeles',
      'client.fieldUnlocked': 'Campo desbloqueado',
      'client.fieldLocked': 'Campo bloqueado',
      'client.selfEmployedYes': 'Sí',
      'client.selfEmployedNo': 'No',

      // Client — Callback
      'client.selectDate': 'Seleccionar fecha',
      'client.callbackScheduled': 'Callback programado para:',
      'client.callbackSaveError': 'No se pudo guardar callback.',
      'client.callbackDeleted': 'Callback eliminado',
      'client.callbackDeleteError': 'No se pudo eliminar callback.',

      // Client — Files
      'client.noLeadSelected': 'No hay lead seleccionado',
      'client.fileTypeNotAllowed': 'Tipo de archivo no permitido:',
      'client.fileTooLarge': 'Archivo muy grande:',
      'client.maxSize': '(máx 10MB)',
      'client.uploadCancelled': 'Carga cancelada:',
      'client.fileUploaded': 'Archivo subido:',
      'client.fileUploadError': 'No se pudo subir el archivo.',
      'client.fileSyncError': 'No se pudieron sincronizar los archivos.',
      'client.fileContentNotFound': 'No se encontró el contenido del archivo.',
      'client.fileDeleteError': 'No se pudo eliminar el archivo.',
      'client.fileDeleted': 'Archivo eliminado',
      'client.fileNotFound': 'Archivo no encontrado',
      'client.selectFileType': 'Debes seleccionar el tipo de archivo.',
      'client.selectApplicantType': 'Selecciona si la deuda es de Applicant o Co-Applicant.',

      // Client — Email & Contract
      'client.sendEmail': 'Enviar correo',
      'client.sending': 'Enviando...',
      'client.generatingContract': 'Generando contrato...',
      'client.creatingPdf': 'Creando PDF en Files',
      'client.openContract': 'Abrir contrato',
      'client.previewContract': 'Ver vista previa del contrato',
      'client.sendContract': 'Enviar contrato',
      'client.noLeadContract': 'No hay lead activo para generar contrato.',
      'client.contractGenerated': 'Contrato generado correctamente.',
      'client.contractGenError': 'No se pudo generar el contrato.',
      'client.invalidRecipient': 'El destinatario no tiene un correo válido.',
      'client.checkCc': 'Revisa los correos en CC.',
      'client.subjectRequired': 'Debes escribir un asunto.',
      'client.bodyRequired': 'Debes escribir el cuerpo del correo.',
      'client.emailSent': 'Correo enviado correctamente.',
      'client.emailSendError': 'No se pudo enviar el correo.',
      'client.noClientEmail': 'El cliente no tiene email registrado.',
      'client.addSubject': 'Agrega un asunto para el correo.',
      'client.contractSavedPending': 'Contrato guardado en Files. Envío por email pendiente de integrar.',
      'client.contractSendError': 'No se pudo enviar el contrato.',

      // Client — Credit
      'client.pullCreditInfo': 'Completa Información de Contacto, City y ZIP Code antes de Pull Credit.',

      // Client — Misc
      'client.noMatch': 'Sin coincidencias',
      'client.relatedWith': 'Relacionado con #',
      'client.totalDebtUpdated': 'Total Debt actualizado desde Creditors:',
      'client.dateSyncError': 'No se pudo sincronizar la fecha en el servidor',
      'client.firstDeposit': 'Primer depósito:',
      'client.selfEmployed': 'Self Employed:',
      'client.selfEmployedError': 'No se pudo actualizar Self Employed.',
      'client.notesLoadError': 'No se pudieron cargar las notas.',

      // UI adicional
      'action.clear': 'Limpiar',
      'action.copy': 'Copiar',
      'action.download': 'Descargar',
      'action.open': 'Abrir',
      'common.applicant': 'Applicant',
      'common.coApplicant': 'Co-Applicant',
      'common.system': 'Sistema',
      'common.notAvailable': 'No disponible',
      'common.unassigned': 'Sin asignar',

      // Login
      'login.panelAria': 'Panel de inicio de sesion',
      'login.title': 'Iniciar sesion',
      'login.identifierLabel': 'Usuario o correo',
      'login.pinLabel': 'PIN (6 digitos)',
      'login.pinGroupAria': 'PIN de acceso de 6 digitos',
      'login.pinPadAria': 'Teclado numerico de PIN',
      'login.backspace': 'Borrar ultimo digito',
      'login.submit': 'Entrar',
      'login.visualAria': 'Mensajes inspiradores',
      'login.quote': 'Como gotas de rocio que alimentan el oceano, cada pequena accion construye mares de transformacion.',

      // Leads
      'leads.searchPlaceholder': 'Buscar leads...',
      'leads.status': 'Estado',
      'leads.statusSearch': 'Buscar estado...',
      'leads.agent': 'Agente',
      'leads.from': 'Desde',
      'leads.to': 'Hasta',
      'leads.apply': 'Aplicar',
      'leads.savedFilters': 'Filtros guardados',
      'leads.noSavedFilters': 'No hay filtros guardados',
      'leads.filterName': 'Nombre del filtro',
      'leads.saveCurrentFilters': 'Guardar filtros actuales',
      'leads.clearFilters': 'Limpiar filtros',
      'leads.newLead': 'Nuevo lead',
      'leads.emptyTitle': 'No se encontraron leads',
      'leads.emptySubtitle': 'Ajusta los filtros o crea un nuevo lead.',
      'leads.page': 'Pagina',
      'leads.of': 'de',

      // Calendario
      'calendar.postIts': 'Post-its',
      'calendar.newNote': 'Nueva nota',
      'calendar.postItsSubtitle': 'Recordatorios rapidos para tu dia',
      'calendar.prevMonth': 'Mes anterior',
      'calendar.nextMonth': 'Mes siguiente',
      'calendar.weekdayMon': 'Lun',
      'calendar.weekdayTue': 'Mar',
      'calendar.weekdayWed': 'Mie',
      'calendar.weekdayThu': 'Jue',
      'calendar.weekdayFri': 'Vie',
      'calendar.weekdaySat': 'Sab',
      'calendar.weekdaySun': 'Dom',
      'calendar.agenda': 'Agenda',
      'calendar.searchSchedule': 'Buscar agenda...',
      'calendar.overdue': 'Vencidas',
      'calendar.upcoming': 'Proximas',
      'calendar.noDateSelected': 'Sin fecha seleccionada',
      'calendar.noTasksToShow': 'Aun no hay tareas para mostrar.',
      'calendar.targetAgenda': 'Agenda destino',
      'calendar.eventTitle': 'Titulo',
      'calendar.eventTitlePlaceholder': 'Ej. Seguimiento de documentos',
      'calendar.clientOptional': 'Cliente / Lead (opcional)',
      'calendar.clientPlaceholder': 'Buscar por nombre, case, telefono...',
      'calendar.openSelectedLead': 'Abrir lead seleccionado',
      'calendar.invalidDate': 'Fecha invalida',

      // Correos
      'emails.searchPlaceholder': 'Buscar en correos...',
      'emails.filters': 'Filtros',
      'emails.deleteSelected': 'Eliminar seleccionados',
      'emails.refresh': 'Actualizar',
      'emails.all': 'Todos',
      'emails.sent': 'Enviado',
      'emails.failed': 'Fallido',
      'emails.pending': 'Pendiente',
      'emails.fromDate': 'Desde',
      'emails.toDate': 'Hasta',
      'emails.clearFilters': 'Limpiar filtros',
      'emails.adminView': 'Vista admin',
      'emails.sellerView': 'Vista seller',
      'emails.selectedOne': '1 seleccionado',
      'emails.selectedMany': 'seleccionados',
      'emails.noRelatedLead': 'Sin lead relacionado',
      'emails.noSubject': 'Sin asunto',
      'emails.emptyTitle': 'No hay correos para mostrar',
      'emails.emptySubtitle': 'Cuando la plataforma envie correos, apareceran aqui.',
      'emails.loadErrorTitle': 'No se pudieron cargar los correos',
      'emails.loadErrorSubtitle': 'Intenta actualizar nuevamente.',
      'emails.sentBy': 'Quien lo mando',
      'emails.relatedRecipient': 'Relacionado / Destinatario',
      'emails.subject': 'Asunto',
      'emails.recipient': 'A quien se envio',
      'emails.sentAt': 'Fecha de envio',
      'emails.status': 'Estado',
      'emails.actions': 'Acciones',
      'emails.selectAll': 'Seleccionar todos',

      // Nuevo lead
      'newLead.title': 'Nuevo lead',
      'newLead.test': 'Test',
      'newLead.nameLabel': 'Nombre del cliente *',
      'newLead.namePlaceholder': 'Ej: Juan Perez',
      'newLead.phoneLabel': 'Numero de telefono *',
      'newLead.stateLabel': 'Estado (US)',
      'newLead.statePlaceholder': 'Buscar estado...',
      'newLead.create': 'Crear lead',

      // Duplicados
      'duplicate.title': 'Posibles duplicados detectados',
      'duplicate.openExisting': 'Abrir existente',
      'duplicate.createLinked': 'Crear y relacionar',
      'duplicate.forceCreate': 'Crear de todos modos',

      // Usuarios
      'users.title': 'Gestion de usuarios',
      'users.adminOnly': 'Solo admin',
      'users.activeUsers': 'Usuarios activos',
      'users.newUser': 'Nuevo usuario',
      'users.loading': 'Cargando usuarios...',
      'users.username': 'Username',
      'users.displayName': 'Display name',
      'users.role': 'Role',
      'users.pinLabel': 'PIN (6 digitos)',
      'users.activeUser': 'Usuario activo',

      // Notificaciones
      'notif.title': 'Notificaciones',

      // Lead detail
      'lead.changeStatus': 'Cambiar estado',
      'lead.selectStatus': 'Seleccionar estado',
      'lead.openRelated': 'Abrir lead relacionado',

      // Calculadora
      'calc.configuration': 'Configuracion',
      'calc.totalDebt': 'Deuda total',
      'calc.copyTotalDebt': 'Copiar deuda total',
      'calc.estimatedSettlement': 'Settlement estimado',
      'calc.programFee': 'Program fee',
      'calc.monthlyBankFee': 'Bank fee mensual',
      'calc.legalPlan': 'Plan legal',
      'calc.includeLegal': 'Incluir plan legal',
      'calc.paymentFrequency': 'Frecuencia de pago',
      'calc.monthly': 'Mensual',
      'calc.biMonthly': 'Dos veces al mes',
      'calc.biWeekly': 'Quincenal',
      'calc.paymentDay': 'Dia de pago',

      // Budget
      'budget.applicantIncome': 'Ingreso Applicant',
      'budget.coApplicantIncome': 'Ingreso Co-Applicant',
      'budget.details': 'Detalles',

      // Notas y templates
      'notes.myTemplates': 'Mis templates',
      'notes.noteActions': 'Acciones de nota',
      'notes.emptyState': 'Aun no hay notas en este lead.',
      'notes.noneStatus': 'Sin notas',
      'notes.selectLeadStatus': 'Selecciona un lead',
      'notes.loading': 'Cargando notas...',
      'notes.readyToAdd': 'Escribe la nota y vuelve a presionar Agregar nota.',
      'notes.writeBeforeAdd': 'Escribe una nota antes de agregar.',
      'notes.adding': 'Agregando nota...',
      'notes.templateAppliedStatus': 'Template aplicado. Presiona Agregar nota para guardarlo.',
      'notes.templatesListAria': 'Lista de templates',
      'template.name': 'Nombre',
      'template.namePlaceholder': 'Ej: Contacto inicial',
      'template.content': 'Contenido',
      'template.contentPlaceholder': 'Escribe el contenido del template...',
      'template.saveAsNew': 'Guardar como nuevo',
      'template.to': 'Para',
      'template.cc': 'CC',
      'template.subject': 'Asunto',
      'template.message': 'Mensaje',

      // Agenda
      'schedule.deletePostIt': 'Eliminar post-it',
      'schedule.writeSomething': 'Escribe algo...',
      'schedule.completed': 'Completada',
      'schedule.inProgress': 'En progreso',
      'schedule.escalated': 'Escalada',
      'schedule.pending': 'Pendiente',
      'schedule.todayTag': 'HOY',
      'schedule.case': 'Case',
      'schedule.caseNoId': 'Case sin ID',
      'schedule.openLead': 'Abrir lead',
      'schedule.markCompleted': 'Marcar completada',
      'schedule.deleting': 'Eliminando...',
      'schedule.moreActions': 'Mas acciones',
      'schedule.overdue': 'Vencidas',
      'schedule.teamEmptyOwner': 'Selecciona un miembro del equipo para ver su agenda.',
      'schedule.teamEmpty': 'No hay tareas para esta seleccion de equipo.',
      'schedule.mineEmpty': 'No tienes tareas para esta fecha.',
      'schedule.selectedDate': 'Fecha seleccionada',
      'schedule.completedSection': 'Completadas',
      'schedule.taskLabel': 'Task',
      'schedule.callbackLabel': 'Callback',

      // Archivos
      'files.categoryOfficialDocument': 'Documento oficial',
      'files.categoryCreditReport': 'Reporte de credito',
      'files.categoryIncomeProof': 'Prueba de ingresos',
      'files.categoryBankStatement': 'Estado bancario',
      'files.categoryContract': 'Contrato',
      'files.categoryOther': 'Otro',
      'files.categoryUnclassified': 'Sin clasificar',
      'files.classifyTitle': 'Clasificar archivo',
      'files.classifyFile': 'Archivo',
      'files.fileType': 'Tipo de archivo',
      'files.selectType': 'Seleccionar tipo...',
      'files.debtBelongsTo': 'La deuda corresponde a',
      'files.selectParty': 'Seleccionar parte...',
      'files.noLeadFiles': 'Este lead no tiene archivos cargados.',
      'files.typeUndefined': 'tipo sin definir',
      'files.previewTitle': 'Vista previa',
      'files.viewerClose': 'Cerrar vista previa',

      // Prompts y confirms
      'prompt.editNote': 'Editar nota:',
      'confirm.deleteNote': 'Eliminar esta nota?',
      'confirm.deleteFile': 'Eliminar este archivo?',

      // Extras de cliente
      'client.includeCoappOn': 'Incluir Co-Applicant en contrato activado.',
      'client.includeCoappOff': 'Incluir Co-Applicant en contrato desactivado.',
      'client.zipUpdated': 'ZIP actualizado:',
      'client.totalDebtCopied': 'Total debt copiado:',
      'client.clickToLock': 'Click para bloquear campo',
      'client.clickToUnlock': 'Click para desbloquear campo',
      'client.clientPhone': 'Telefono del cliente',
      'client.clientEmail': 'Email del cliente',
      'client.contractGeneratedTitle': 'Contrato generado',
      'client.pullCreditChoose': 'Selecciona de quien quieres ejecutar el credit pull.',
      'client.completeCoapp': 'Completa datos del coapp para habilitar.',
      'client.regenerateContract': 'Regenerar contrato',
      'client.regeneratingContract': 'Regenerando...',
      'client.contractLoadingWait': 'Generando contrato, espera un momento...',
      'client.contractPreviewLoadError': 'El contrato se genero, pero no se pudo cargar la vista previa.',
      'client.noContractPreview': 'Aun no hay contrato para mostrar.',
      'client.emailRegisterError': 'No se pudo registrar el correo.',
      'client.noLeadEmail': 'No hay lead activo para enviar correo.',
      'client.fileReadError': 'No se pudo leer el archivo.',
      'client.fileReadDbError': 'No se pudo leer el archivo desde almacenamiento local.',
      'client.fileLocalSaveLimit': 'No se pudo guardar el archivo localmente por limite de almacenamiento.',
      'client.templateCreated': 'Template creado correctamente.',
      'client.templateSavedAsNew': 'Template guardado como nuevo.',
      'client.notesActionError': 'No se pudo completar la accion de notas.',
      'client.templatesActionError': 'No se pudo completar la accion de templates.',

      // Lang toggle
      'lang.label': 'ES',
      'lang.title': 'Cambiar a inglés',
    }
  };

  let currentLang = localStorage.getItem(STORAGE_KEY) || DEFAULT_LANG;

  // ─── Core API ───

  function t(key, fallback) {
    const d = dict[currentLang];
    if (d && d[key] !== undefined) return d[key];
    const fb = dict[DEFAULT_LANG];
    if (fb && fb[key] !== undefined) return fb[key];
    return fallback || key;
  }

  function getLang() {
    return currentLang;
  }

  function setLang(lang) {
    if (!dict[lang]) return;
    currentLang = lang;
    localStorage.setItem(STORAGE_KEY, lang);
    applyToDOM();
    document.documentElement.setAttribute('lang', lang);
    window.dispatchEvent(new CustomEvent('langchange', { detail: { lang } }));
  }

  function toggleLang() {
    setLang(currentLang === 'en' ? 'es' : 'en');
  }

  // ─── DOM application ───

  function applyToDOM() {
    // data-i18n → textContent
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      const val = t(key);
      if (val !== key) el.textContent = val;
    });

    // data-i18n-placeholder → placeholder
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      const val = t(key);
      if (val !== key) el.placeholder = val;
    });

    // data-i18n-title → title
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.getAttribute('data-i18n-title');
      const val = t(key);
      if (val !== key) el.title = val;
    });

    // data-i18n-aria → aria-label
    document.querySelectorAll('[data-i18n-aria]').forEach(el => {
      const key = el.getAttribute('data-i18n-aria');
      const val = t(key);
      if (val !== key) el.setAttribute('aria-label', val);
    });

    // Update toggle button
    const btn = document.getElementById('langToggleBtn');
    if (btn) {
      const label = btn.querySelector('.lang-toggle-label');
      if (label) label.textContent = t('lang.label');
      btn.title = t('lang.title');
    }
  }

  // ─── Init ───

  function init() {
    document.documentElement.setAttribute('lang', currentLang);
    applyToDOM();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ─── Public API ───
  window.i18n = { t, getLang, setLang, toggleLang, applyToDOM };
  window.t = t;
})();
