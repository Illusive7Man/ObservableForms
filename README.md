<div><img align="left" src="https://i.imgur.com/41C5GKI.png" alt="Observable logo" width="200"/>


# Observable Forms (for jQuery) [![npm version](https://badge.fury.io/js/observable-forms.svg)](http://badge.fury.io/js/observable-forms)
Inspired by Angular forms.
</div>
<br/><br/><br/><br/>

With this library, you can effortlessly create an interactive representation of your html form,
whose API is based on reactive patterns.<br/>
Instead of manually selecting and attaching JavaScript code to form's elements,
a more direct, explicit, access to elements' functionalities is provided through objects called `FormControl` and `FormGroup`.<br/>
This library, using observables and static type checking, offers a modern workflow for all types of projects,
without even requiring a build process (TypeScript or bundlers). It can be used with server rendered templates (.NET MVC, PHP, Django, etc.),
and with SPAs.
##### Prerequisites:
- Basic knowledge of RxJS.<br/>

##### Table of Contents
- [Functionality & Usage](#functionality)<br/>
- [Demos](#demos)<br/>
- [Installation](#installation)<br/>

<a name="functionality"/>

## Functionality & Usage

### Form Control
This is one of the two fundamental building blocks of Observable Forms, along with
`FormGroup`. It tracks the value and validation status of an individual form control
(a single text input, a set of radio inputs with the same name, etc.).

Creating and using a form control is pretty simple:

```typescript
// Module imports
import {switchMap, tap} from "rxjs/operators";
import {FormControlStatus} from "./types";

// FormControl created
let firstName = $('#firstName').asFormControl().enableValidation();
firstName.valueChanges.subscribe(value => console.log('My new value is: ' + value));

// ... let's try something a bit more complicated
// Either copy the delivery address into payment address field,
// or track payment address status, and alert the user if invalid (validation logic not shown)

let deliveryAddress = $('#delivery-address').asFormControl();
let paymentAddress = $('#payment-address').asFormControl().enableValidation();

// Observable<boolean>
let isPaymentDifferentFromDelivery$ = $('#different-checkbox').asFormControl().valueChanges
    .pipe(map(value => value === 'true'), startWith(false));

isPaymentDifferentFromDelivery$.pipe(switchMap(isDifferent => isDifferent
    ? paymentAddress.statusChanges.pipe(tap(status => status === FormControlStatus.INVALID && alert('Entered address is not valid')))
    : deliveryAddress.valueChanges.pipe(tap(value => paymentAddress.setValue(value)))
)).subscribe();

// Code ends up being more concise and cleaner (no removeEventListener())
```
<br/>

### Form Group
Form group aggregates controls found in the subtree of the selected element(s) into one object,
with each control's name as the key. Name is either control's `name` attribute or one manually provided.<br/>
Class of this object accepts a **type parameter** representing the model of the form group,
which provides static type checking when working with the controls and values.<br/>
<ins>Type checking is also available in plain JavaScript no-build projects, as demonstrated in the Demos.</ins><br/><br/>
_Author's note: The best and easiest way to have type checking is to find a tool
that will generate TypeScript versions of your backend classes, and use those as type parameters of form groups.
Here's the one I use for .NET MVC, [link](https://www.nuget.org/packages/TypeScriptBuilder)._


Some features of the FormGroup objects are:
- The value is a JSON object of child controls' names and values.
- Controls can be added and removed from the group.
- Validation
- Custom controls as child controls
- Web Components support


```typescript
class MyForm {
    fullName: string;
    isSubscriber: boolean;
    addresses: {street: string; city: string}[];
}

// Create a form group (TS version)
let form = $('form').asFormGroup<MyForm>();

// Accessing child controls and value, with editor providing type information
form.controls.fullName.valueChanges.subscribe(_ => '...')
form.controls.addresses[0].city.valueChanges.subscribe(_ => '...');
console.log(form.value.isSubscriber);
```
<img src="https://i.imgur.com/P1wCcPU.png" alt="Autocomplete in action" width="100%"/>
<div align="center">Autocomplete in action</div>
<br/><br/>

Some of the properties, observables and methods of `FormControl` and `FormGroup` are:
- value, valueChanges&nbsp;&emsp; - _string or JSON_
- status, statusChanges&emsp;- _valid, invalid or disabled_
- touched&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;- _has the user interacted with the element(s) at all_
- dirty&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&nbsp; - _has the user changed element(s) value_
- setValue()
- reset()


Despite some inconsistencies, Angular docs can be used as more detailed API reference:
[AbstractControl](https://angular.io/api/forms/AbstractControl), [FormControl](https://angular.io/api/forms/FormControl),
[FormGroup](https://angular.io/api/forms/FormGroup).


<a name="demos"/>

## Demos
These demos will try to cover as many scenarios as possible, such as:
- disabling / enabling form controls
- adding / removing controls from the DOM
- changing element's types
- creating controls from non-input elements
- handling [Web Components](https://developer.mozilla.org/en-US/docs/Web/Web_Components)
- changing form's data / resetting
- handling arrays

_Note: These demos are hosted on codesandbox, and code behind the forms can be accessed using the "Open Sandbox" button.
Fullscreen view is preferable, considering the style of validation messages.
Styling will be configurable in the future versions,
but for now, it can be turned off, so a custom implementation can be used._<br/>

### Demo 1 - "A standard form"
A JavaScript project covering a lot of library's functionalities, and showing how to integrate type checking into JavaScript code.<br/>
[Demo 1](https://b1h75.csb.app/)

_Note: that CodeSandbox has some built-in js bundler that allows non-standard imports in .js files.
Below those imports are comments on how they should be used plain .js files._
<br/>
### Demo 2 - "Custom made"
A TypeScript project covering custom form controls. Also demonstrates support for Web Components.<br/>
[Demo 2](https://dxrdg.csb.app/)


### Demo 3 - "Form update"
A JavaScript project showing how to change form's data and how to reset it.<br/>
[Demo 3](https://rysti.csb.app/)

<a name="installation"/>

## Installation
### ES6 via npm
`npm i observable-forms` <br/><br/>
Inside a html script tag, or in javascript:
```html
<script type="module">
    import {} from "./node_modules/observable-forms/dist/index.js";
    // Library self initializes when module is loaded.

    let $formControl = $('input').asFormControl().valueChanges.subscribe(val => console.log(val));
    ...
</script>
```

or, in Typescript:
```javascript
import {ConfigService, Validators} from "observable-forms";

// Declaratively adding validation to controls using html attributes
ConfigService.registerAttributeValidators({
    'data-val-required': Validators.required,
    'data-val-email': Validators.email,
    'data-val-url': $e => $e.val() === '' || URL_REGEXP.test($e.val()) ? null : {url: true}
});
```
### CDN
For CDN, you can use [unpkg](https://unpkg.com/): <br/>
https://unpkg.com/observable-forms/dist/index.js

```html
<script type="module">
    import {} from "https://unpkg.com/observable-forms/dist/index.js";
    ...
</script>
```


