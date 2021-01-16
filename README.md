# Observable Forms plug-in for jQuery
Inspired by Angular's forms.
<br/>
<br/>

Adds observable streams to jQuery objects of selected form elements. <br/>
Properties such as 
- valueChanges
- statusChanges 
- touched, untouched, dirty, pristine
- setValidators

and many more, are added to the jQuery object: `let $formControl = $('#some-input')`.<br />
List of properties can be found in the [type file](@types/input.d.ts).
<br/><br/>

Controlling form's behavior and validation in Angular is such a straightforward task that I had to implement some of the workflow in jQuery.<br/>
It is mostly thanks to reactive programming (RxJS), which is made possible by these observable streams.<br/>
_Note that Visual Studio, JetBrains, and possibly every other code editor, will have type support and offer documentation for the added properties._

#### Prerequisites:
- If you have a knowledge of RxJS and are using jQuery on your site, this plug-in is a must.<br/>
- If you don't know RxJS, you might want to see if the basic usage of the plug-in is usable to you, i.e. how it handles front-end validation, and what additional API it offers for you to take advantage of. 

## Usage
By the default behavior of the overridden jQuery constructor, a form control is an extended jQuery object of a single selected input element.
A form group is an extended object of selected input elements (plural), or a form.<br/>
Form controls and form groups can also be initialized from any jQueryObject programmatically.<br/>
Showcase section below will demo the features of controls and groups, and have a detailed explanation of the example's behaviour in those demos.

``` javascript
let $formControl1 = $('#some-input');
let $formControl2 = $('#some-non-input-element').asFormControl();
let $formGroup1   = $('#some-input, #some-select');
let $formGroup2   = $('#some-form')
let $formGroup3   = $('#some-non-input-element').asFormGroup();
```
The overridden constructor will detect that selected elements are inputs and add the needed properties.
Due to performance issues that might occur when using other jQuery libraries, querying methods such as
find, children, siblings, etc., will not create form controls out of the results automatically,
but you can always transform them programmatically.<br/>

##### Default controls / groups
```html
<form>, <input>, <select>, <textarea>
```
Type checkbox and radio are supported also. 

## Showcases
These demos will try to cover as many possible scenarios as possible, such as:
- changing element's types
- disabling/enabling form controls
- removing controls from the DOM
- adding new controls to the DOM (some group's subtree)
- handling Web Components
- changing form's data / resetting (not yet implemented)
- handling arrays
- resolution dependent behavior of validation css

_Note: These demos are hosted on codesandbox, and code behind the forms can be accessed using the "Open Sandbox" button.
Fullscreen view is preferable, considering the style of validation messages.
Configuration of that styling will be more detailed / made easier in the future._<br/>
_Note 2: AFAIK, on codesandbox it's not possible to reference installed modules from .html files,
so I am referencing my package from CDN url. On the local machine referencing node_modules folder is possible, and that adds the type support._ 
### Demo 1 - "A standard form"
https://b1h75.csb.app/

## Installation
### ES6 via npm
`npm i observable-forms` <br/>
Editor support (autocomplete, documentation) included when using this method.
```html
<script type="module">
import {} from "./node_modules/observable-forms/dist/index.js";
// Any import is required so the library would self initialize.

let $formControl = $('input').valueChanges.subscribe(val => console.log(val));
...
</script>
```

or, in Javascript / Typescript
```javascript
import {ConfigService, Validators} from "observable-forms";

ConfigService.registerAttributeValidators({
    'data-val-required': Validators.required,
    'data-val-email': Validators.email,
    'data-val-url': $e => $e.val() === '' || URL_REGEXP.test($e.val()) ? null : {url: true}
});
```
### CDN
For CDN, you can use [unpkg](https://unpkg.com/): <br/>
https://unpkg.com/observable-forms/dist/index.min.js

```html
<script type="module">
import {} from "https://unpkg.com/observable-forms/dist/index.min.js";
...
</script>
```


