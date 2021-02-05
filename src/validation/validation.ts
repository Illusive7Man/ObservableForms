import {debounceTime, delay, distinctUntilChanged, filter, map, share, shareReplay, startWith, switchMap, take, takeWhile, tap} from "rxjs/operators";
import {createPopperLite as createPopper, Modifier, Placement} from "@popperjs/core/dist/esm";
import flip from '@popperjs/core/lib/modifiers/flip.js';
import preventOverflow from '@popperjs/core/lib/modifiers/preventOverflow.js';
import offset from '@popperjs/core/lib/modifiers/offset.js';
import {Options} from '@popperjs/core/lib/modifiers/offset';
import {BehaviorSubject, fromEvent, merge, NEVER, of, Subject} from "rxjs";
import {checkIfRadioControl, FormControlStatus, isValidFormControl, checkIfCheckboxControl} from "../common/misc";
import JQuery = JQueryInternal.JQueryInternal;
import {JQueryInternal} from "../../@types/input";
import {fromFullVisibility} from "../observables/fromFullVisibility";
import {fromResize} from "../observables/fromResize";
import {registerInputToGroupTransformation} from "../input";
import {cachedControlsAndGroups} from "../common/cache";
import {ConfigService} from "../common/config";

/*========================== Public API ==========================*/

export function enableValidation(jQueryObject: JQuery<FormControlType | HTMLFormElement>): JQuery<FormControlType | HTMLFormElement> {

    // Check if it's already enabled
    if (jQueryObject.isValidationEnabled)
        return;

    // Check if it's actually a form control (maybe it's empty)
    if (!jQueryObject.isFormControl && !jQueryObject.isFormGroup)
        jQueryObject = jQueryObject.asFormGroup() as any;

    jQueryObject.controls$.subscribe(controls =>
        controls.filter($formControl => $formControl.valid === undefined && $formControl !== jQueryObject).forEach($formControl => enableValidation($formControl)));

    // valid == true -> invalid = false;
    addValidInvalidGetterSetter(jQueryObject);

    // Programmatically update the validity.
    jQueryObject.manualValidityUpdateSubject = new Subject<void>();

    if (jQueryObject.isFormControl)
        setValidationRulesFromAttributes(jQueryObject as JQuery<FormControlType>);

    /*** statusChanges ***/
    jQueryObject.statusChanges = jQueryObject.controls$.pipe(
        switchMap(controls => merge(
        jQueryObject.isFormControl ? jQueryObject.valueChanges : merge(...controls.map($formControl => $formControl.statusChanges.pipe(delay(1)))),
            jQueryObject.manualValidityUpdateSubject.asObservable(),
            jQueryObject.disabledSubject
        ).pipe(startWith(''))),
        // Note 1: Controls update status on value change
        // Note 2: Groups when their controls change status (which supersedes valueChanges)
        // Note 3: startWith() updates validity when the controls array changes
        // Note 4: delay() on statusChanges makes sure group's status is calculated AFTER group's value is calculated

        startWith(''),
        tap(_ => jQueryObject.errors = jQueryObject.getValidators()?.map(validatorFn => validatorFn(jQueryObject)).reduce((acc, curr) => curr ? {...acc, ...curr} : acc, null)),
        map(_ => (jQueryObject.isFormGroup && jQueryObject.errors)
            || jQueryObject.controls.some($formControl => $formControl.errors && !$formControl.attr('disabled') && [...$formControl].some(e => e.getAttribute('type') !== 'hidden'))
                ? FormControlStatus.INVALID : FormControlStatus.VALID),
        // Note: Invalid when either object itself or some of the selected non-hidden, non-disabled, controls have errors.

        share()
    );

    // Subscribe for status update
    jQueryObject._existingValidationSubscription =
        jQueryObject.statusChanges.subscribe(status => {jQueryObject.status = status; jQueryObject.valid = status === FormControlStatus.VALID;});

    // Attach popper
    if (!jQueryObject[0].matches('dummy-element'))
        attachPopper(jQueryObject);

    return jQueryObject;
}


export function updateValidity(jQueryObject: JQuery<FormControlType | HTMLFormElement>): void {
    jQueryObject.manualValidityUpdateSubject.next();
}

export function setValidators(jQueryObject: JQuery<FormControlType>, newValidator: ValidatorFn[] | null): void {
    jQueryObject._validators = newValidator;
    jQueryObject.updateValidity();
}

export function getValidators(jQueryObject: JQuery<FormControlType>): ValidatorFn[] | null {
    return jQueryObject._validators ?? null;
}

export function disableValidation(jQueryObject: JQuery<FormControlType | HTMLFormElement>): JQuery<FormControlType | HTMLFormElement> {

    jQueryObject._existingValidationSubscription.unsubscribe();
    jQueryObject.manualValidityUpdateSubject.complete();

    delete jQueryObject._existingValidationSubscription;
    delete jQueryObject.manualValidityUpdateSubject;
    delete jQueryObject.statusChanges;

    jQueryObject.validityPopper.destroy;
    delete jQueryObject.validityPopper;
    delete jQueryObject.isValidityMessageShown$;

    delete jQueryObject.valid;
    delete jQueryObject.invalid;
    delete (jQueryObject as any)._valid;
    delete (jQueryObject as any)._invalid;
    delete jQueryObject.errors;
    delete jQueryObject._validators;
    delete jQueryObject.isValidationEnabled;

    return jQueryObject;
}

/**
 * Attaches validity popper, which will be displayed when control is dirty and invalid, auto-flip when needed, auto-update whenever reference changes visibility.
 * @param jQueryObject Form control / group the popper attaches to.
 */
export function attachPopper(jQueryObject: JQuery<FormControlType | HTMLFormElement>): void {
    
    let $popper = $(`
        <span class="popper validation" role="tooltip">
            <span class="field-validation"></span>
            <span class="popper__arrow" data-popper-arrow></span>
        </span>
        `);

    // Config: overflows document -> flips to top. Left and right poppers have 5px offset.
    jQueryObject.validityPopper = createPopper($('body')[0], $popper[0], { modifiers: [
            {...preventOverflow, options: {rootBoundary: 'document'}},
            {...flip, options: {fallbackPlacements: ['top'], rootBoundary: 'document'}},
            {...offset, options: {offset: arg0 => ['left', 'right'].includes(arg0.placement) ? [0, 5] : [0, 0]} as Options}]});


    // Catch manual setting of placement
    let isPlacedManually = false;
    let originalSetOptions = jQueryObject.validityPopper.setOptions;
    jQueryObject.validityPopper.setOptions = function (options, isInternal = false) {
        if (!isInternal && options.placement)
            isPlacedManually = true;
        return originalSetOptions(options);
    }


    // Control the placement and handle DOM visibility
    let reference$ = jQueryObject.controls$.pipe(
        filter(controls => controls.length > 0),
        map(_ => determinePopperPositioning(jQueryObject).$reference), shareReplay(1));

    // Setup reference element
    reference$.subscribe($reference => {
        $reference.addClass('popper-reference').append($popper);
        jQueryObject.validityPopper.state.elements.reference = $reference[0];
        jQueryObject.validityPopper.update();
    });

    // Visibility - position/placement update
    let v$ =
    reference$.pipe(takeWhile(_ => !isPlacedManually), switchMap($reference => fromFullVisibility($reference[0])), takeWhile(_ => !isPlacedManually))
        .subscribe(isFullyVisible => isFullyVisible ? updatePopperPlacement(jQueryObject) : $popper.css('visibility', 'hidden')); // updatePopperPlacement knows about visibility

    // Resize - position tracking
    let isFresh = true, isTransition = false;
    let r$ =
    reference$.pipe(
        switchMap($reference => fromResize($reference[0])),                                                      // Observe reference's resize
        tap(_ => isFresh ? (isFresh = false) || jQueryObject.validityPopper.forceUpdate() : isTransition = true), // Do the first one (?. - used in teardown)
        debounceTime(34),                                                                                       // If triggered more than once, debounce 100ms
        tap(_ => isTransition && jQueryObject.validityPopper.forceUpdate())                                        // and do it one final time
    ).subscribe(_ => (isFresh = true) && (isTransition = false));

    jQueryObject.controls$.subscribe(null, null, () => {v$.unsubscribe(); r$.unsubscribe();});

    // Handle display of errors
    let dirtyObservable$ = jQueryObject.dirtySubject.asObservable().pipe(map(_ => jQueryObject.controls.every($c => $c.dirty)), distinctUntilChanged());

    let popperShownSubject = new BehaviorSubject<boolean>(false);
    jQueryObject.isValidityMessageShown$ = popperShownSubject.asObservable().pipe(distinctUntilChanged());
    
    let wasValidityMessageShown = false;
    jQueryObject.isValidityMessageShown$.pipe(filter(isShown => isShown === true), take(1)).subscribe(_ => wasValidityMessageShown = true);
    
    merge(jQueryObject.statusChanges, dirtyObservable$).pipe(
        switchMap(_ => jQueryObject.is(':focus') && wasValidityMessageShown === false
            ? fromEvent(jQueryObject, 'blur')
            : of(null)))
        .subscribe(_ => {
            let $popper = $(jQueryObject.validityPopper.state.elements.popper);
            let enabled = !jQueryObject.attr('disabled');
            let validationErrors = window['validationErrors'] as any;

            // Show if dirty and invalid (with personal errors) or hide otherwise
            if (jQueryObject.dirty && jQueryObject.invalid && jQueryObject.errors) {

                // Form groups, by default, show their errors once all of their descendants become dirty
                if (jQueryObject.controls.length > 1 && jQueryObject.controls.some(formControl => formControl.pristine) && wasValidityMessageShown === false)
                    return;
                    
                let errorMessage = Object.keys(jQueryObject.errors).map(key => typeof jQueryObject.errors[key] === 'string' ? jQueryObject.errors[key] : validationErrors[key]).join('\n');

                errorMessage && $popper.find('.field-validation').addClass('field-validation-error').html(errorMessage);
                
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

}

export function hasError(jQueryObject: JQuery<FormControlType | HTMLFormElement>, errorCode: string): boolean {
    return jQueryObject.errors && Object.keys(jQueryObject.errors).some(key => key === errorCode);
}

/*========================== Private Part ==========================*/

/**
 * Adds validator functions to the control based on its properties. Works with radios and checkboxes.
 * @param $formControl
 */
function setValidationRulesFromAttributes($formControl: JQuery<FormControlType>): void {

    let validators: ValidatorFn[] = [];

    for (let attribute in ConfigService.registeredAttributeValidators)
        if ($formControl.attr(attribute) !== undefined)
            validators = validators.concat(Array.isArray(ConfigService.registeredAttributeValidators[attribute]) ? ConfigService.registeredAttributeValidators[attribute] as ValidatorFn[] : [ConfigService.registeredAttributeValidators[attribute] as ValidatorFn]);
    

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
        },
        configurable: true
    });

    Object.defineProperty(jQueryObject, 'invalid', {
        get() {
            return this._invalid;
        },
        set(value: JQuery<FormControlType>[]) {
            this._invalid = value;
            this._valid = !value;
        },
        configurable: true
    });

    Object.defineProperty(jQueryObject, 'isValidationEnabled', {
        get() {
            return this.valid !== undefined;
        },
        configurable: true
    });
}

/**
 * Returns reference and placement (left / right) of the popper.
 * @param jQueryObject
 */
function determinePopperPositioning(jQueryObject: JQuery<FormControlType | HTMLFormElement>): {$reference: JQuery<HTMLElement>, placement: Placement} {
    let $predefinedReference: JQuery<HTMLElement> = jQueryObject.attr('popper-reference') ? jQueryObject.closest(jQueryObject.attr('popper-reference')) as any : null;

    if ($predefinedReference)
        return {$reference: $predefinedReference, placement: determinePlacement(jQueryObject, $predefinedReference[0])};

    function determinePlacement(jQueryObject: JQuery<FormControlType | HTMLFormElement>, reference: HTMLElement): Placement {
        let predefinedPlacement: Placement = jQueryObject.attr('popper-placement');

        if (predefinedPlacement)
            return predefinedPlacement;

        if (jQueryObject.isFormControl && reference)
            return hasInputsOnLeft(jQueryObject.controls[0], reference) ? 'right' : 'left';

        return 'left';
    }

    /**
     * Checks if any input is to the left of the current input so the popper would then go 'right', instead of default 'left'.
     */
    function hasInputsOnLeft($formControl: JQuery<FormControlType>, reference: HTMLElement): boolean {
        let referenceRect = reference.getBoundingClientRect();

        // Form controls that come before current one in DOM.
        let previousFormControlElements = cachedControlsAndGroups.slice(0, cachedControlsAndGroups.indexOf($formControl))
            .flatMap($e => $e.toArray())
            .filter(element => isValidFormControl(element));

        return previousFormControlElements.some(previousControl => {
            let previousControlRect = previousControl.getBoundingClientRect();

            return Math.abs(previousControlRect.top - referenceRect.top) < referenceRect.height
                && referenceRect.left > previousControlRect.right
                && referenceRect.left < previousControlRect.right + 300
        });
    }

    // Reference is not predefined, let's find it.
    let $reference: JQuery<HTMLElement>;

    if (jQueryObject.isFormControl && checkIfRadioControl(jQueryObject) === false && checkIfCheckboxControl(jQueryObject) === false) {
        let formControl = jQueryObject.controls[0][0];
        $reference = $(formControl.parentElement) as any;

    } else {

        let references = jQueryObject.controls.flatMap($formControl => $formControl.toArray()) // flatMap handles multiple element such as radios / checkboxes
            .filter(e => e.getAttribute('type') !== 'hidden')                                         // ignore 'hidden' inputs
            .map(e => $(e.parentElement))
            .filter($e => $e.length > 0);                                                                         // references are parents.

        // Find the common ancestor of all the references
        if (references.every($reference => $reference === references[0]))
            $reference = references[0] as any;
        else
            $reference = getCommonAncestor(...references);
    }

    // Handle empty controls
    $reference = $reference ?? jQueryObject as any;

    return {$reference, placement: determinePlacement(jQueryObject, $reference[0])}
}

/**
 * Find the element that is a common ancestor of all the proveded objects.
 * Used to find the popper reference of form groups (or radio / checkbox control).
 */
function getCommonAncestor(...objects): JQuery<HTMLElement> {
    let parentsA = getParents(objects[0]);
    let parentsB = objects.length == 2 ? getParents(objects[1]) : getParents(getCommonAncestor(...objects.slice(1)).children(':eq(0)'));

    let commonAncestor = parentsA.find(parentA => parentsB.includes(parentA));

    return $(commonAncestor) as any;
}

function getParents($element: JQuery<HTMLElement>): HTMLElement[] {
    if ($element[0] == null)
        return [];

    let isInsideShadowRoot = $element[0].getRootNode() instanceof ShadowRoot;

    let parents = $element.parents().toArray();

    if (isInsideShadowRoot) {
        let $hostElement = $(($element[0].getRootNode() as ShadowRoot).host);
        parents = [...parents, $hostElement[0] as HTMLElement, ...$hostElement.parents()];
    }

    return parents;
}

async function updatePopperPlacement(jQueryObject: JQuery<FormControlType | HTMLFormElement>): Promise<void> {
    let $popper = $(jQueryObject.validityPopper.state.elements.popper);

    // Make sure the popper takes up space in DOM
    jQueryObject.isValidityMessageShown$.pipe(take(1)).subscribe(isShown => !isShown && $popper.css('visibility', 'hidden').show());

    // Update position
    // @ts-ignore
    await jQueryObject.validityPopper.setOptions({placement: determinePopperPositioning(jQueryObject).placement}, true);

    // Hide if it's supposed to be hidden
    jQueryObject.isValidityMessageShown$.pipe(tap(_ => $popper.css('visibility', 'visible')), take(1))
        .subscribe(isShown => !isShown && $popper.hide());
}


/**
 * Validator functions that came from the attributes stay on the control, other go to the group.
 * @param $newGroup
 * @param $oldControl
 */
function migrateValidationToNewGroup($newGroup: JQuery<FormControlType | HTMLFormElement>, $oldControl: JQuery<FormControlType>): void {

    let attributeValidators = Object.values(ConfigService.registeredAttributeValidators).flatMap(e => e);

    let validatorsFromAttributes = $newGroup.getValidators().filter(valFn => attributeValidators.includes(valFn));
    let otherValidators = $newGroup.getValidators().filter(valFn => attributeValidators.includes(valFn) === false);

    $newGroup.setValidators(otherValidators);
    $oldControl.setValidators(validatorsFromAttributes);

    $newGroup.updateValidity();
    $oldControl.updateValidity();
}

registerInputToGroupTransformation(migrateValidationToNewGroup);
