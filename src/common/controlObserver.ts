import {ConfigService} from "./config";
import {checkIfRadioControl, constructControls, convertJsonToArray, findFormControls, isFormControl, isInputElement} from "./misc";
import {AbstractControl} from "../abstractControl";
import {cachedControlsAndGroups} from "./cache";
import {FormControl} from "../formControl";
import {FormGroup} from "../formGroup";
import {FormControlType} from "./types";
import {fromEvent} from "rxjs";


/**
 * Used for updating list of existing controls, disposing the removed ones,
 * and updating the list of controls selected by a group.
 */
let controlRemovalObserver = new MutationObserver(entries => {

    if (ConfigService.useMutationObservers === false)
        return;

    /*** Form controls removed from DOM are removed from cache and groups  ***/

    let removedHtmlElements = (<HTMLElement[]>entries.flatMap(entry => [...entry.removedNodes]
        .filter(node => node instanceof HTMLElement)
        .filter((element: HTMLElement) => ConfigService.excludedObserverElements.every(selector => !element.matches(selector)))));

    let removedControls = removedHtmlElements.flatMap(e => findFormControls(e, true));

    // Remove empty controls
    if (removedControls.length > 0) {

        let cachedControlsToRemove: AbstractControl[] = [];

        for (let cachedElement of cachedControlsAndGroups) {
            if (cachedElement instanceof FormControl && removedControls.includes(cachedElement.toJQuery()[0]))
                cachedControlsToRemove.push(cachedElement);

            else if (removedHtmlElements.some(element => element === cachedElement.toJQuery()[0] || element.contains(cachedElement.toJQuery()[0])))
                cachedControlsToRemove.push(cachedElement);

            else if (cachedElement instanceof FormGroup && cachedElement.controlsArray.some(c => removedControls.includes(c.toJQuery()[0])))
                cachedElement.unindexedArray
                    .filter(({name, control}) => removedControls.includes(control.toJQuery()[0]))
                    .forEach(({name,}) => (cachedElement as FormGroup<any>).removeControl(name));

        }

        // Dispose used observables
        cachedControlsToRemove.forEach(element => element.destroy());
    }


    /*** Form controls, from added nodes, are added to groups that have selected those nodes, or their parents ***/

    let addedHtmlElements = (<HTMLElement[]>entries.flatMap(entry => [...entry.addedNodes]
        .filter(node => node instanceof HTMLElement)
        .filter((element: HTMLElement) => ConfigService.excludedObserverElements.every(selector => !element.matches(selector)))));

    let addedControlsInElements = addedHtmlElements.map(element => ({element, controlElements: findFormControls(element)})).filter(_ => _.controlElements.length > 0);


    // region handle radios

    let radioControlElements = addedControlsInElements.flatMap(addedControlsInElement => addedControlsInElement.controlElements)    // all elements
        .filter(control => isInputElement(control) && checkIfRadioControl([control])) as HTMLInputElement[];         // radio elements

    for (let radioElement of radioControlElements) {
        let cachedSameNameRadio = cachedControlsAndGroups.find(item => item instanceof FormControl && radioElement.getAttribute('name') === item.toJQuery()[0].getAttribute('name'))

        if (cachedSameNameRadio == null)
            continue;

        // Update the jquery and valueChanges observable
        (cachedSameNameRadio as any).jQueryObject = cachedSameNameRadio.toJQuery().add(radioElement);
        (cachedSameNameRadio as any).subscriptions.add(
            fromEvent(radioElement, 'input').subscribe(_ => cachedSameNameRadio.setValue(radioElement.value))
        )

        // Keep the radio element from further processing...
        let elementToClear = addedControlsInElements.find(addedControlsInElement => addedControlsInElement.controlElements.includes(radioElement));
        if (elementToClear)
            elementToClear.controlElements = elementToClear.controlElements.filter(element => element !== radioElement);
    }

    // endregion



    if (addedControlsInElements.length > 0) {
        let cachedGroupsWithNonControlSelectors = cachedControlsAndGroups
            .filter(element => element instanceof FormGroup)
            .map(group => ({group, nonControls: [...group.toJQuery()].filter(e => !isFormControl(e))}))
            .filter(_ => _.nonControls.length > 0);

        for (let cachedGroup of cachedGroupsWithNonControlSelectors) {

            let addedToGroup = addedControlsInElements
                .filter(addedControlsInElement => cachedGroup.nonControls.some(nonControl => nonControl.contains(addedControlsInElement.element)))
                .flatMap(addedControls => addedControls.controlElements);

            if (addedToGroup.length === 0)
                continue;

            // Function returns false if controls belong to the same control
            let constructedControls = constructControls(addedToGroup.map(e => e as FormControlType));
            let controls = convertJsonToArray(constructedControls, true);

            controls.forEach(control => (cachedGroup.group as FormGroup<any>).addControl(control.value, control.name));
        }
    }

});

let observedRoots: any[] = [document.body];

function restartObserving (): void {
    if (hasDomLoaded === false)
        return;

    controlRemovalObserver.disconnect();

    for (let root of observedRoots)
        controlRemovalObserver.observe(root, {childList: true, subtree: true});
}

let hasDomLoaded = false;
$(_ => {
    hasDomLoaded = true;
    restartObserving();
});


export function observeShadowRoot(shadowRoot: ShadowRoot): void {
    if (observedRoots.includes(shadowRoot))
        return;

    observedRoots.push(shadowRoot);
    restartObserving();
}

export function stopObservingShadowRoot(shadowRoot: ShadowRoot): void {

    let index = observedRoots.indexOf(shadowRoot)

    if (index === -1)
        return;

    observedRoots.splice(index, 1);
    restartObserving();
}
