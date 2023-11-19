import {distinctUntilChanged, filter, map, shareReplay, switchMap, take, takeWhile, tap} from 'rxjs/operators';
import {createPopperLite as createPopper, Placement} from '@popperjs/core/dist/esm';
import flip from '@popperjs/core/lib/modifiers/flip.js';
import preventOverflow from '@popperjs/core/lib/modifiers/preventOverflow.js';
import offset from '@popperjs/core/lib/modifiers/offset.js';
import {Options} from '@popperjs/core/lib/modifiers/offset';
import {BehaviorSubject, fromEvent, merge, of} from 'rxjs';
import {isFormControl, isInputElement} from '../common/misc';
import {fromFullVisibility} from '../common/observables/fromFullVisibility';
import {fromResize} from '../common/observables/fromResize';
import {cachedControlsAndGroups} from '../common/cache';
import {ConfigService} from '../common/config';
import {FormControl} from '../formControl';
import {AbstractControl} from '../abstractControl';
import {flattenControls, FormGroup} from '../formGroup';
import {ValidatorFn} from '../common/types';


/**
 * Attaches validity popper, which will be displayed when control is dirty and invalid, auto-flip when needed, auto-update whenever reference changes visibility.
 * @param abstractControl Form control / group the popper attaches to.
 */
export function attachPopper(abstractControl: AbstractControl): void {

    let isVanilla = ConfigService.popperConfig.style === 'vanilla';

    let popper = htmlToElement(`
        <span class="popper validation ${isVanilla ? 'vanilla' : null}" role="tooltip">
            <span class="field-validation"></span>
            <span class="popper__arrow" data-popper-arrow></span>
        </span>
        `);

    // Config: overflows document -> flips to top. Left and right poppers have 5px offset.
    abstractControl.validityPopper = createPopper(document.body, popper, {
        modifiers: [
            {...preventOverflow, options: {rootBoundary: 'document'}},
            {...flip, options: {fallbackPlacements: [ConfigService.popperConfig.fallbackPosition], rootBoundary: 'document'}, enabled: !isVanilla},
            {...offset, options: {offset: arg0 => ['left', 'right'].includes(arg0.placement) ? [0, 5] : [0, 0]} as Options}]
    });


    // Catch manual setting of placement
    let isPlacedManually = false;
    let originalSetOptions = abstractControl.validityPopper.setOptions;
    abstractControl.validityPopper.setOptions = function (options, isInternal = false) {
        if (!isInternal && options.placement)
            isPlacedManually = true;
        return originalSetOptions(options);
    }

    // Catch manual setting of reference
    let usesManualReference = false;
    Object.defineProperty(abstractControl.validityPopper, 'setReference', {
        value: function (reference: HTMLElement) {
            usesManualReference = true;
            abstractControl.validityPopper.state.elements.reference = reference;
            abstractControl.validityPopper.update();
        }
    })

    let controlsArray$ = abstractControl instanceof FormGroup ? abstractControl.controlsArray$ : of([abstractControl]);

    // Control the placement and handle DOM visibility
    let reference = controlsArray$.pipe(
        filter(_ => !usesManualReference),
        map(_ => determinePopperPositioning(abstractControl).reference), shareReplay(1));

    // Setup reference element
    reference.subscribe(reference => {
        reference.classList.add('popper-reference')
        reference.append(popper);
        isInputElement(reference) || reference.shadowRoot ? reference.after(popper) : reference.append(popper);
        abstractControl.validityPopper.state.elements.reference = reference;
        abstractControl.validityPopper.update();
    });

    // Visibility - position/placement update
    let v$ =
        reference.pipe(takeWhile(_ => !isPlacedManually), switchMap(reference => fromFullVisibility(reference)), takeWhile(_ => !isPlacedManually))
            .subscribe(isFullyVisible => isFullyVisible ? updatePopperPlacement(abstractControl) : popper.style.visibility = 'hidden'); // updatePopperPlacement knows about visibility

    // Resize - position tracking
    let r$ =
        reference.pipe(
            switchMap(reference => fromResize(reference))
        ).subscribe(_ => abstractControl.validityPopper.forceUpdate());

    // Dispose logic
    abstractControl.valueChanges.subscribe(null, null, () => {
        v$.unsubscribe();
        r$.unsubscribe();
    });

    // Handle display of errors
    let dirtyObservable$ = (abstractControl as any).dirtySubject.asObservable().pipe(
        map(_ => abstractControl instanceof FormGroup ? flattenControls(abstractControl.controls).every($c => $c.dirty) : abstractControl.dirty), distinctUntilChanged());

    let popperShownSubject = new BehaviorSubject<boolean>(false);
    abstractControl.isValidityMessageShown$ = popperShownSubject.asObservable().pipe(distinctUntilChanged());

    let wasValidityMessageShown = false;
    abstractControl.isValidityMessageShown$.pipe(filter(isShown => isShown === true), take(1)).subscribe(_ => wasValidityMessageShown = true);

    merge(abstractControl.statusChanges, dirtyObservable$).pipe(
        switchMap(_ => [...[abstractControl.source]].flat().some(e => e.matches(':focus') || e.querySelector(':focus')) && wasValidityMessageShown === false
            ? fromEvent(abstractControl.source, 'blur')
            : of(null)))
        .subscribe(_ => {
            let popper = abstractControl.validityPopper.state.elements.popper;

            let notHidden = abstractControl instanceof FormControl ? [...[abstractControl.source]].flat()[0]?.getAttribute('type') !== 'hidden' : true;

            // Show if dirty and invalid (with personal errors) or hide otherwise
            if (abstractControl.dirty && abstractControl.invalid && abstractControl.errors && notHidden) {

                // Form groups, by default, show their errors once all of their descendants become dirty
                if (abstractControl instanceof FormGroup && flattenControls(abstractControl.controls).some(formControl => formControl.pristine) && wasValidityMessageShown === false)
                    return;

                let errorMessage = Object.keys(abstractControl.errors).map(key => typeof abstractControl.errors[key] === 'string' ? abstractControl.errors[key] : ConfigService.validationErrors[key]).join('\n');

                if (errorMessage) {
                    popper.querySelector('.field-validation').classList.add('field-validation-error');
                    popper.querySelector('.field-validation').innerHTML = errorMessage;
                }


                if (abstractControl.enabled) {
                    popper.style.display = 'block';
                    popperShownSubject.next(true);
                    abstractControl.validityPopper.update();
                } else {
                    popper.style.display = 'none';
                    popperShownSubject.next(false);
                }
            } else {
                popper.style.display = 'none';
                popper.querySelector('.field-validation').classList.remove('field-validation-error');
                popper.querySelector('.field-validation').textContent = '';
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
        if ([...[formControl.source]].flat()[0]?.getAttribute(attribute) != null)
            validators = validators.concat(Array.isArray(ConfigService.registeredAttributeValidators[attribute]) ? ConfigService.registeredAttributeValidators[attribute] as ValidatorFn[] : [ConfigService.registeredAttributeValidators[attribute] as ValidatorFn]);


    if (validators.length > 0)
        formControl.setValidators(validators);

}

/**
 * Returns reference and placement (left / right) of the popper.
 * @param abstractControl
 */
function determinePopperPositioning(abstractControl: AbstractControl): { reference: HTMLElement, placement: Placement } {
    let object = [...[abstractControl.source]].flat()[0];
    let predefinedReference: HTMLElement = object.getAttribute('popper-reference') ? object.closest(object.getAttribute('popper-reference')) as any : null;

    if (predefinedReference)
        return {reference: predefinedReference, placement: determinePlacement(abstractControl, predefinedReference)};

    function determinePlacement(abstractControl: AbstractControl, reference: HTMLElement): Placement {
        let predefinedPlacement: Placement = [...[abstractControl.source]].flat()[0]?.getAttribute('popper-placement');

        if (predefinedPlacement)
            return predefinedPlacement;

        if (ConfigService.popperConfig.defaultPosition !== 'left')
            return ConfigService.popperConfig.defaultPosition;

        if (abstractControl instanceof FormControl && reference)
            return hasInputsOnLeft([...[abstractControl.source]].flat()[0], reference) ? 'right' : 'left';

        return 'left';
    }

    /**
     * Checks if any input is to the left of the current input so the popper would then go 'right', instead of default 'left'.
     */
    function hasInputsOnLeft(formControlElement: HTMLElement, reference: HTMLElement): boolean {
        let referenceRect = reference.getBoundingClientRect();

        let cachedObjects = cachedControlsAndGroups.flatMap(abstractControl => [...[abstractControl.source]].flat());

        // Form controls that come before current one in DOM.
        let previousFormControlElements = cachedObjects.slice(0, cachedObjects.indexOf(formControlElement))
            .filter(element => isFormControl(element));

        return previousFormControlElements.some(previousControl => {
            let previousControlRect = previousControl.getBoundingClientRect();

            return Math.abs(previousControlRect.top - referenceRect.top) < referenceRect.height
                && referenceRect.left > previousControlRect.right
                && referenceRect.left < previousControlRect.right + 300
        });
    }

    // Reference is not predefined, let's find it.
    let reference: HTMLElement;

    if ([...[abstractControl.source]].flat().length === 1) {
        reference = [...[abstractControl.source]].flat()[0];
    } else {

        let references = (abstractControl instanceof FormGroup ? flattenControls(abstractControl.controls) : [abstractControl])
            .flatMap(formControl => [...[formControl.source]].flat())                                     // flatMap handles multiple element such as radios / checkboxes
            .filter(e => e.getAttribute('type') !== 'hidden')                                        // ignore 'hidden' inputs

        // Find the common ancestor of all the references
        if (references.every(reference => reference === references[0]))
            reference = references[0] as any;
        else
            reference = getCommonAncestor(...references);
    }

    // Handle empty controls
    reference = reference ?? abstractControl as any;

    return {reference: reference, placement: determinePlacement(abstractControl, reference)}
}

/**
 * Find the element that is a common ancestor of all the proveded objects.
 * Used to find the popper reference of form groups (or radio / checkbox control).
 */
function getCommonAncestor(...objects: HTMLElement[]): HTMLElement {
    let parentsA = getParents(objects[0]);
    let parentsB = objects.length == 2 ? getParents(objects[1]) : getParents(getCommonAncestor(...objects.slice(1)).children.item(0) as HTMLElement);

    return parentsA.find(parentA => parentsB.includes(parentA));
}

function getParents(element: HTMLElement): HTMLElement[] {
    if (element == null)
        return [];

    let isInsideShadowRoot = element.getRootNode() instanceof ShadowRoot;

    let parents = parentsVanilla(element)

    if (isInsideShadowRoot) {
        let hostElement = (element.getRootNode() as ShadowRoot).host;
        parents = [...parents, hostElement as HTMLElement, ...parentsVanilla(hostElement)];
    }

    return parents;
}

async function updatePopperPlacement(abstractControl: AbstractControl): Promise<void> {
    let popper = abstractControl.validityPopper.state.elements.popper;

    // Make sure the popper takes up space in DOM
    abstractControl.isValidityMessageShown$.pipe(take(1)).subscribe(isShown => !isShown && (popper.style.visibility = 'hidden') && (popper.style.display = 'block'));

    // Update position
    // @ts-ignore
    await abstractControl.validityPopper.setOptions({placement: determinePopperPositioning(abstractControl).placement}, true);

    // Hide if it's supposed to be hidden
    abstractControl.isValidityMessageShown$.pipe(tap(_ => (popper.style.visibility = 'visible')), take(1))
        .subscribe(isShown => !isShown && (popper.style.display = 'none'));
}

function parentsVanilla(el): HTMLElement[] {
    let parentSelector = document;
    let parents = [];
    let p = el.parentNode;
    while (p !== parentSelector) {
        let o = p;
        parents.push(o);
        p = o.parentNode;
    }
    parents.push(parentSelector);
    return parents;
}

function htmlToElement(html: string): HTMLElement {
    var template = document.createElement('template');
    html = html.trim(); // Never return a text node of whitespace as the result
    template.innerHTML = html;
    return template.content.firstChild as HTMLElement;
}