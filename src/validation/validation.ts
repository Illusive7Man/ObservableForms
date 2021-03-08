import {debounceTime, delay, distinctUntilChanged, filter, map, share, shareReplay, startWith, switchMap, take, takeWhile, tap} from "rxjs/operators";
import {createPopperLite as createPopper, Modifier, Placement} from "@popperjs/core/dist/esm";
import flip from '@popperjs/core/lib/modifiers/flip.js';
import preventOverflow from '@popperjs/core/lib/modifiers/preventOverflow.js';
import offset from '@popperjs/core/lib/modifiers/offset.js';
import {Options} from '@popperjs/core/lib/modifiers/offset';
import {BehaviorSubject, fromEvent, merge, NEVER, of, Subject} from "rxjs";
import {checkIfRadioControl, isFormControl, checkIfCheckboxControl, isInputElement} from "../common/misc";
import {fromFullVisibility} from "../observables/fromFullVisibility";
import {fromResize} from "../observables/fromResize";
import {cachedControlsAndGroups} from "../common/cache";
import {ConfigService} from "../common/config";
import {FormControl} from "../formControl";
import {AbstractControl} from "../abstractControl";
import {flattenControls, FormGroup} from "../formGroup";
import {ValidatorFn} from "../common/types";


/**
 * Attaches validity popper, which will be displayed when control is dirty and invalid, auto-flip when needed, auto-update whenever reference changes visibility.
 * @param abstractControl Form control / group the popper attaches to.
 */
export function attachPopper(abstractControl: AbstractControl): void {
    
    let $popper = $(`
        <span class="popper validation" role="tooltip">
            <span class="field-validation"></span>
            <span class="popper__arrow" data-popper-arrow></span>
        </span>
        `);

    // Config: overflows document -> flips to top. Left and right poppers have 5px offset.
    abstractControl.validityPopper = createPopper($('body')[0], $popper[0], { modifiers: [
            {...preventOverflow, options: {rootBoundary: 'document'}},
            {...flip, options: {fallbackPlacements: ['top'], rootBoundary: 'document'}},
            {...offset, options: {offset: arg0 => ['left', 'right'].includes(arg0.placement) ? [0, 5] : [0, 0]} as Options}]});


    // Catch manual setting of placement
    let isPlacedManually = false;
    let originalSetOptions = abstractControl.validityPopper.setOptions;
    abstractControl.validityPopper.setOptions = function (options, isInternal = false) {
        if (!isInternal && options.placement)
            isPlacedManually = true;
        return originalSetOptions(options);
    }

    let controlsArray$ = abstractControl instanceof FormGroup ? abstractControl.controlsArray$ : of([abstractControl]);

    // Control the placement and handle DOM visibility
    let reference$ = controlsArray$.pipe(
        filter(controls => controls.length > 0),
        map(_ => determinePopperPositioning(abstractControl).$reference), shareReplay(1));

    // Setup reference element
    reference$.subscribe($reference => {
        $reference.addClass('popper-reference').append($popper);
        isInputElement($reference[0]) || $reference[0].shadowRoot ? $reference.after($popper) : $reference.append($popper);
        abstractControl.validityPopper.state.elements.reference = $reference[0];
        abstractControl.validityPopper.update();
    });

    // Visibility - position/placement update
    let v$ =
    reference$.pipe(takeWhile(_ => !isPlacedManually), switchMap($reference => fromFullVisibility($reference[0])), takeWhile(_ => !isPlacedManually))
        .subscribe(isFullyVisible => isFullyVisible ? updatePopperPlacement(abstractControl) : $popper.css('visibility', 'hidden')); // updatePopperPlacement knows about visibility

    // Resize - position tracking
    let r$ =
    reference$.pipe(
        switchMap($reference => fromResize($reference[0]))
    ).subscribe(_ => abstractControl.validityPopper.forceUpdate());

    // Dispose logic
    abstractControl.valueChanges.subscribe(null, null, () => {v$.unsubscribe(); r$.unsubscribe();});

    // Handle display of errors
    let dirtyObservable$ = (abstractControl as any).dirtySubject.asObservable().pipe(
        map(_ => abstractControl instanceof FormGroup ? flattenControls(abstractControl.controls).every($c => $c.dirty) : abstractControl.dirty), distinctUntilChanged());

    let popperShownSubject = new BehaviorSubject<boolean>(false);
    abstractControl.isValidityMessageShown$ = popperShownSubject.asObservable().pipe(distinctUntilChanged());
    
    let wasValidityMessageShown = false;
    abstractControl.isValidityMessageShown$.pipe(filter(isShown => isShown === true), take(1)).subscribe(_ => wasValidityMessageShown = true);
    
    merge(abstractControl.statusChanges, dirtyObservable$).pipe(
        switchMap(_ => abstractControl.toJQuery().is(':focus') && wasValidityMessageShown === false
            ? fromEvent(abstractControl.toJQuery(), 'blur')
            : of(null)))
        .subscribe(_ => {
            let $popper = $(abstractControl.validityPopper.state.elements.popper);

            let notHidden = abstractControl instanceof FormControl ? abstractControl.toJQuery().attr('type') !== 'hidden' : true;

            // Show if dirty and invalid (with personal errors) or hide otherwise
            if (abstractControl.dirty && abstractControl.invalid && abstractControl.errors && notHidden) {

                // Form groups, by default, show their errors once all of their descendants become dirty
                if (abstractControl instanceof FormGroup && flattenControls(abstractControl.controls).some(formControl => formControl.pristine) && wasValidityMessageShown === false)
                    return;
                    
                let errorMessage = Object.keys(abstractControl.errors).map(key => typeof abstractControl.errors[key] === 'string' ? abstractControl.errors[key] : ConfigService.validationErrors[key]).join('\n');

                errorMessage && $popper.find('.field-validation').addClass('field-validation-error').html(errorMessage);
                
                if (abstractControl.enabled) {
                    $popper.show();
                    popperShownSubject.next(true);
                    abstractControl.validityPopper.update();
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

/*========================== Private Part ==========================*/

/**
 * Adds validator functions to the control based on its properties. Works with radios and checkboxes.
 * @param formControl
 */
export function setValidationRulesFromAttributes(formControl: FormControl): void {

    let validators: ValidatorFn[] = [];

    for (let attribute in ConfigService.registeredAttributeValidators)
        if (formControl.toJQuery().attr(attribute) !== undefined)
            validators = validators.concat(Array.isArray(ConfigService.registeredAttributeValidators[attribute]) ? ConfigService.registeredAttributeValidators[attribute] as ValidatorFn[] : [ConfigService.registeredAttributeValidators[attribute] as ValidatorFn]);
    

    if (validators.length > 0)
        formControl.setValidators(validators);

}

/**
 * Returns reference and placement (left / right) of the popper.
 * @param abstractControl
 */
function determinePopperPositioning(abstractControl: AbstractControl): {$reference: JQuery<HTMLElement>, placement: Placement} {
    let jQueryObject = abstractControl.toJQuery();
    let $predefinedReference: JQuery<HTMLElement> = jQueryObject.attr('popper-reference') ? jQueryObject.closest(jQueryObject.attr('popper-reference')) as any : null;

    if ($predefinedReference)
        return {$reference: $predefinedReference, placement: determinePlacement(abstractControl, $predefinedReference[0])};

    function determinePlacement(abstractControl: AbstractControl, reference: HTMLElement): Placement {
        let predefinedPlacement: Placement = abstractControl.toJQuery().attr('popper-placement');

        if (predefinedPlacement)
            return predefinedPlacement;

        if (abstractControl instanceof FormControl && reference)
            return hasInputsOnLeft(abstractControl.toJQuery(), reference) ? 'right' : 'left';

        return 'left';
    }

    /**
     * Checks if any input is to the left of the current input so the popper would then go 'right', instead of default 'left'.
     */
    function hasInputsOnLeft($formControl: JQuery, reference: HTMLElement): boolean {
        let referenceRect = reference.getBoundingClientRect();

        let cachedJQueryObjects = cachedControlsAndGroups.map(abstractControl => abstractControl.toJQuery());

        // Form controls that come before current one in DOM.
        let previousFormControlElements = cachedJQueryObjects.slice(0, cachedJQueryObjects.indexOf($formControl))
            .flatMap($e => $e.toArray())
            .filter(element => isFormControl(element));

        return previousFormControlElements.some(previousControl => {
            let previousControlRect = previousControl.getBoundingClientRect();

            return Math.abs(previousControlRect.top - referenceRect.top) < referenceRect.height
                && referenceRect.left > previousControlRect.right
                && referenceRect.left < previousControlRect.right + 300
        });
    }

    // Reference is not predefined, let's find it.
    let $reference: JQuery<HTMLElement>;

    if (abstractControl.toJQuery().length === 1) {

        let controlElement = abstractControl.toJQuery()[0];
        $reference = $(controlElement);

    } else {

        let references = (abstractControl instanceof FormGroup ? flattenControls(abstractControl.controls) : [abstractControl])
            .flatMap(formControl => formControl.toJQuery().toArray())                                     // flatMap handles multiple element such as radios / checkboxes
            .filter(e => e.getAttribute('type') !== 'hidden')                                        // ignore 'hidden' inputs
            .map(e => $(e))
            .filter($e => $e.length > 0);

        // Find the common ancestor of all the references
        if (references.every($reference => $reference === references[0]))
            $reference = references[0] as any;
        else
            $reference = getCommonAncestor(...references);
    }

    // Handle empty controls
    $reference = $reference ?? abstractControl as any;

    return {$reference, placement: determinePlacement(abstractControl, $reference[0])}
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

async function updatePopperPlacement(abstractControl: AbstractControl): Promise<void> {
    let $popper = $(abstractControl.validityPopper.state.elements.popper);

    // Make sure the popper takes up space in DOM
    abstractControl.isValidityMessageShown$.pipe(take(1)).subscribe(isShown => !isShown && $popper.css('visibility', 'hidden').show());

    // Update position
    // @ts-ignore
    await abstractControl.validityPopper.setOptions({placement: determinePopperPositioning(abstractControl).placement}, true);

    // Hide if it's supposed to be hidden
    abstractControl.isValidityMessageShown$.pipe(tap(_ => $popper.css('visibility', 'visible')), take(1))
        .subscribe(isShown => !isShown && $popper.hide());
}

