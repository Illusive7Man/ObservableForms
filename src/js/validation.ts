import {delay, distinctUntilChanged, filter, map, share, shareReplay, startWith, switchMap, take, tap} from "rxjs/operators";
import {createPopperLite as createPopper, Modifier, Placement} from "@popperjs/core/dist/esm";
import {BehaviorSubject, combineLatest, fromEvent, merge, NEVER, Observable, of, Subject, timer} from "rxjs";
import {checkIfRadioGroup} from "./misc";
import JQuery = JQueryInternal.JQueryInternal;
import {JQueryInternal} from "./@types/input";

/*========================== Public API ==========================*/

export enum FormControlStatus {
    VALID = 'VALID',
    INVALID = 'INVALID',
    PENDING = 'PENDING',
    DISABLED = 'DISABLED'
}

export function enableValidation(jQueryObject: JQuery<FormControlType | HTMLFormElement>, opts?: {onlySelf?: boolean; emitEvent?: boolean;}): void {

    // Check if it's already enabled
    if (jQueryObject.valid !== undefined)
        return;
    
    // Check if it's actually a form control (maybe it's empty)
    if (jQueryObject.isFormControl !== true)
        jQueryObject.convertToFormControl();

    jQueryObject.selectedFormControls$.subscribe(selectedFormControls => 
        selectedFormControls.filter($formControl => $formControl.valid === undefined && $formControl !== jQueryObject).forEach($formControl => enableValidation($formControl)));

    // valid == true -> invalid = false;
    addValidInvalidGetterSetter(jQueryObject);

    // Programatically update the validity.
    jQueryObject.manualValidityUpdateSubject = new Subject<void>();

    if (jQueryObject.selectedFormControls.length === 1)
        setValidationRulesFromAttributes(jQueryObject as JQuery<FormControlType>);
    
    let statusChangesSubject = new Subject<FormControlStatus>();
    jQueryObject.statusChangesSubject = statusChangesSubject;
    
    jQueryObject.selectedFormControls$.pipe(
        switchMap(selectedFormControls => merge(
        selectedFormControls.length === 0 ? NEVER : selectedFormControls.length === 1 ? jQueryObject.valueChanges : merge(...jQueryObject.selectedFormControls.map($formControl => $formControl.statusChanges)).pipe(delay(1)),
            jQueryObject.manualValidityUpdateSubject.asObservable())
        ),
        startWith(''),
        
        tap(_ => jQueryObject.errors = jQueryObject.getValidators()?.map(validatorFn => validatorFn(jQueryObject)).reduce((acc, curr) => curr ? {...acc, ...curr} : acc, null)),
        
        map(_ => (jQueryObject.selectedFormControls.length > 1 && jQueryObject.errors) || jQueryObject.selectedFormControls.some($formControl => $formControl.errors && !$formControl.attr('disabled') && !$formControl.is('[type=hidden]'))
            ? FormControlStatus.INVALID : FormControlStatus.VALID),
        
        tap(status => jQueryObject.valid = status === FormControlStatus.VALID)
    ).subscribe(status => statusChangesSubject.next(status));

    jQueryObject.statusChanges = statusChangesSubject.asObservable().pipe(share());
    
    // Subscribe for status update
    jQueryObject.statusChanges.subscribe(status => jQueryObject.status = status);

    attachPopper(jQueryObject);
}


export function updateValidity(jQueryObject: JQuery<FormControlType | HTMLFormElement>, opts?: { onlySelf?: boolean; emitEvent?: boolean; }): void {
    jQueryObject.manualValidityUpdateSubject.next();
}

export function setValidators(jQueryObject: JQuery<FormControlType>, newValidator: ValidatorFn[] | null): void {
    jQueryObject._validators = newValidator;
    jQueryObject.updateValidity();
}

export function getValidators(jQueryObject: JQuery<FormControlType>): ValidatorFn[] | null {
    return jQueryObject._validators ?? null;
}

export function disableValidation(jQueryObject: JQuery<FormControlType>, opts?: {onlySelf?: boolean; emitEvent?: boolean;}): void {
    // Functions configures mostly private properties
    let jQueryAnyObject = jQueryObject as any;

    if (jQueryAnyObject._existingValidationSubscription)
        jQueryAnyObject._existingValidationSubscription.unsubscribe();

    delete jQueryAnyObject.valid;
    delete jQueryAnyObject.invalid;
    delete jQueryAnyObject._existingValidationSubscription;
    delete jQueryAnyObject._runValidator;
}


let registeredAttributeValidators: {[key: string]: ValidatorFn | ValidatorFn[]} = {};

/**
 * Registers validator functions to use on an control that has the specified attribute. You could use this function multiple times, but it won't have an effect on existing form controls.
 * @param attributeValidators Object that has desired attribute names as keys, whose value are validator functions.
 */
export function registerAttributeValidators(attributeValidators: {[key: string]: ValidatorFn | ValidatorFn[]}): void {
    registeredAttributeValidators = {...attributeValidators, ...attributeValidators};
}

export function attachPopper(jQueryObject: JQuery<FormControlType | HTMLFormElement>): void {
    
    let $popper = $(`
        <span class="popper validation" role="tooltip">
            <span class="field-validation"></span>
            <span class="popper__arrow" data-popper-arrow></span>
        </span>
        `);

    jQueryObject.validityPopper = createPopper($('body')[0], $popper[0],
        { modifiers: [{ preventOverflow: { boundariesElement: $(document.body) } } as Partial<Modifier<any, any>>] });
    
    // Reference and placement
    let observer: IntersectionObserver;
    
    jQueryObject.selectedFormControls$.pipe(filter(selectedFormControls => selectedFormControls.length > 0), map(_ => determinePlacement(jQueryObject))).subscribe(({$reference}) => {
        $reference.append($popper);
        jQueryObject.validityPopper.state.elements.reference = $reference[0];
        jQueryObject.validityPopper.update();

        observer && observer.disconnect();
        observer = new IntersectionObserver((entries, _) => entries[0].intersectionRatio > 0 && updatePopperPlacement(jQueryObject));
        observer.observe($reference[0]);
    }, null, () => observer.disconnect());
    
    let dirtyObservable$ = jQueryObject.selectedFormControls$.pipe(switchMap(_ => checkIfRadioGroup(jQueryObject)
        ? jQueryObject.dirtySubject.asObservable()
        : combineLatest(jQueryObject.selectedFormControls.map(formControl => formControl.dirtySubject.asObservable())).pipe(
            map(dirtyStatuses => dirtyStatuses.every(status => status === true)), distinctUntilChanged())));

    let popperShownSubject = new BehaviorSubject<boolean>(false);
    jQueryObject.isValidityMessageShown$ = popperShownSubject.asObservable().pipe(distinctUntilChanged());
    
    let wasValidityMessageShown = false;
    jQueryObject.isValidityMessageShown$.pipe(filter(isShown => isShown === true), take(1)).subscribe(_ => wasValidityMessageShown = true);
    
    merge(jQueryObject.statusChanges, dirtyObservable$).pipe(
        switchMap(_ => jQueryObject.is(':focus') && wasValidityMessageShown !== true 
            ? fromEvent(jQueryObject, 'blur')
            : of(null)))
        .subscribe(_ => {
            let $popper = $(jQueryObject.validityPopper.state.elements.popper);
            let enabled = !jQueryObject.attr('disabled');
            let validationErrors = window['validationErrors'] as any;

            // Show if dirty and invalid (with personal errors) or hide otherwise
            if (jQueryObject.dirty && jQueryObject.invalid && jQueryObject.errors) {
                
                // Form groups, by default, show their errors once all of their descendants become dirty
                if (jQueryObject.selectedFormControls.length > 1 && !checkIfRadioGroup(jQueryObject) && jQueryObject.selectedFormControls.some(formControl => formControl.pristine)) {
                    return;
                }
                    
                let errorMessage = Object.keys(jQueryObject.errors).map(key => typeof jQueryObject.errors[key] === 'string' ? jQueryObject.errors[key] : validationErrors[key]).join('\n');

                $popper.find('.field-validation').addClass('field-validation-error').html(errorMessage);
                
                if (enabled) {
                    $popper.show();
                    popperShownSubject.next(true);
                    jQueryObject.validityPopper.update();
                } else {
                    $popper.hide();
                    popperShownSubject.next(false);
                }
            } else {
                $popper.hide();
                $popper.find('.field-validation').removeClass('field-validation-error').text('');
                popperShownSubject.next(false);
            }
            
    });
    
    // TODO: popper.update nakon show/hide
}

/*========================== Private Part ==========================*/

/**
 * Adds validator functions to the control based on its properties. Works with radios.
 * @param $formControl
 */
function setValidationRulesFromAttributes($formControl: JQuery<FormControlType>): void {

    let validators: ValidatorFn[] = [];

    for (let attribute in registeredAttributeValidators)
        if ($formControl.attr(attribute) !== undefined)
            validators = validators.concat(Array.isArray(registeredAttributeValidators[attribute]) ? registeredAttributeValidators[attribute] as ValidatorFn[] : [registeredAttributeValidators[attribute] as ValidatorFn]);
    

    if (validators.length > 0)
        $formControl.setValidators(validators);

}

/**
 * Adds corresponding getter and setter for the valid and invalid properties.
 */
function addValidInvalidGetterSetter(jQueryObject: JQuery<FormControlType | HTMLFormElement>): void {
    Object.defineProperty(jQueryObject, 'valid', {
        get() {
            return this._valid;
        },
        set(value: JQuery<FormControlType>[]) {
            this._valid = value;
            this._invalid = !value;
        }
    });

    Object.defineProperty(jQueryObject, 'invalid', {
        get() {
            return this._invalid;
        },
        set(value: JQuery<FormControlType>[]) {
            this._invalid = value;
            this._valid = !value;
        }
    });
}

function determinePlacement(jQueryObject: JQuery<FormControlType | HTMLFormElement>): {$reference: JQuery<HTMLElement>, placement: Placement} {
    let predefinedPlacement: Placement = jQueryObject.attr('data-val-pop');
    
    let singleElementFn = (formControl: JQuery<FormControlType>): {$reference: JQuery<HTMLElement>, placement: Placement} => {
        let $reference: JQuery<HTMLElement>;
        let placement: Placement;

        if (formControl.parent('.input-group').length) {
            $reference = formControl.parent();
            let referenceRect = $reference[0].getBoundingClientRect();
            
            let inputGroups = $('.input-group:visible').toArray().map(e => $(e));
            
            let areAnyToTheLeft = inputGroups.some(inputGroup => {
                let inputGroupRect = inputGroup[0].getBoundingClientRect();
                
                return Math.abs(inputGroupRect.top - referenceRect.top) < referenceRect.height
                    && referenceRect.left > inputGroupRect.right 
                    && referenceRect.left < inputGroupRect.right + 300
            })
            
            placement = areAnyToTheLeft
                ? 'right'
                : 'left';
            
        } else {
            $reference = formControl.parent();
            placement = 'right-start';
        }


        return {$reference, placement: predefinedPlacement ?? placement};
    }

    if (jQueryObject.selectedFormControls.length === 1)
        return singleElementFn(jQueryObject as JQuery<FormControlType>);

    else {
        let $reference: JQuery<HTMLElement>;
        let placement: Placement;
        
        let results = jQueryObject.selectedFormControls.filter(e => e.is(':not([type=hidden])')).map(e => singleElementFn($(e) as JQuery<FormControlType>));
        
        // Find the common ancestor of all the references
        if (results.every(result => result.$reference === results[0].$reference))
            $reference = results[0].$reference;
        else
            $reference = getCommonAncestor(...results.map(result => result.$reference));

        // Use the common placement, of the default 
        if (results.every(result => result.placement === results[0].placement))
            placement = results[0].placement;
        else
            placement = 'right-start';
        
        return {$reference, placement};
    }
}

function getCommonAncestor(...objects): JQuery<HTMLElement> {
    let $parentsA = objects[0].parents();
    let $parentsB = objects.length == 2 ? objects[1].parents() : $(getCommonAncestor(...objects.slice(1))).children(':eq(0)').parents();

    let found = null;

    $parentsA.each(function() {
        let thisA = this;

        $parentsB.each(function() {
            if (thisA == this)
            {
                found = this;
                return false;
            }
        });

        if (found)
            return false;
    });

    return $(found) as JQuery<HTMLElement>
}

async function updatePopperPlacement(jQueryObject: JQuery<FormControlType | HTMLFormElement>): Promise<void> {
    let $popper = $(jQueryObject.validityPopper.state.elements.popper);

    let isPopperVisible = $popper.is(':visible');

    !isPopperVisible && $popper.css('visibility', 'hidden').show();
    
    jQueryObject.validityPopper.setOptions({...jQueryObject.validityPopper.state, placement: determinePlacement(jQueryObject).placement});
    await timer(10).toPromise();
    
    !isPopperVisible && $popper.css('visibility', 'visible').hide();
}


