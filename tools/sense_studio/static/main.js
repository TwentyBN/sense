// Suppress Enter key on text input fields for submitting forms, so that for example search fields don't submit
// the form on selection of an entry
window.addEventListener(
    'keydown',
    function(e) {
        if ((e.keyIdentifier=='U+000A' || e.keyIdentifier=='Enter' || e.keyCode==13)
            && e.target.nodeName=='INPUT' && e.target.type=='text')
        {
            e.preventDefault();
            return false;
        }
    },
    true
);


document.addEventListener("DOMContentLoaded", function () {
    let pathSearchInputs = document.getElementsByClassName('path-search');
    let filePathSearchInputs = document.getElementsByClassName('file-path-search');

    for (input of pathSearchInputs) {
        const currentInput = input;
        new autoComplete({
            selector: input,
            minChars: 1,
            cache: false,
            source: async function(term, response) {
                browseDirectory(term, '').then(r => response(r.subdirs));
            },
            onSelect: function(event, term, item) {
                currentInput.oninput();
            }
        });
    }

    for (input of filePathSearchInputs) {
        const currentInput = input;
        new autoComplete({
            selector: input,
            minChars: 1,
            cache: false,
            source: async function(term, response) {
                browseDirectory(term, '').then(r => response(r.subdirs.concat(r.video_files)));
            },
            onSelect: function(event, term, item) {
                currentInput.oninput();
            }
        });
    }
});

function setFormWarning(label, input, text) {
    label.innerHTML = text;

    if (text === '') {
        input.classList.remove('uk-form-danger');
    } else {
        input.classList.add('uk-form-danger');
    }
}


async function editNewProject() {
    let nameInput = document.getElementById('newProjectName');
    let nameLabel = document.getElementById('newProjectNameLabel');
    let pathInput = document.getElementById('newProjectPath');
    let pathLabel = document.getElementById('newProjectPathLabel');
    let fullPathDiv = document.getElementById('fullPath');
    let createProjectButton = document.getElementById('createProject');

    let name = nameInput.value;
    let path = pathInput.value;

    let directoriesResponse = await browseDirectory(path, name);

    // Show project path and highlight the name of the folder that will be created
    pathPrefix = directoriesResponse.project_path_prefix
    projectDir = directoriesResponse.project_dir
    fullPathDiv.innerHTML = `<p>${pathPrefix}<span class='uk-text-primary uk-text-bolder'>${projectDir}</span></p>`;

    let disabled = false;

    // Check that project name is filled, unique and not yet present in directory
    if (name === '') {
        setFormWarning(nameLabel, nameInput, '');
        disabled = true;
    } else if (!directoriesResponse.project_name_unique) {
        setFormWarning(nameLabel, nameInput, 'This project name is already used');
        disabled = true;
    } else if (directoriesResponse.project_dir_exists) {
        setFormWarning(nameLabel, nameInput, 'A directory with this name already exists in the chosen location');
        disabled = true;
    } else {
        setFormWarning(nameLabel, nameInput, '');
    }

    // Check that project path is filled and exists
    if (path === '') {
        setFormWarning(pathLabel, pathInput, '');
        disabled = true;
    } else if (!directoriesResponse.path_exists) {
        setFormWarning(pathLabel, pathInput, 'This path does not exist');
        disabled = true;
    } else {
        setFormWarning(pathLabel, pathInput, '');
    }

    createProjectButton.disabled = disabled;
}


async function editImportProject() {
    let pathInput = document.getElementById('importProjectPath');
    let pathLabel = document.getElementById('importProjectPathLabel');
    let importProjectButton = document.getElementById('importProject');

    let path = pathInput.value;

    let directoriesResponse = await browseDirectory(path, '');

    let disabled = false;

    // Check that project path is filled, unique and exists
    if (path === '') {
        setFormWarning(pathLabel, pathInput, '');
        disabled = true;
    } else if (!directoriesResponse.path_unique) {
        setFormWarning(pathLabel, pathInput, 'Another project is already registered in this location');
        disabled = true;
    } else if (!directoriesResponse.path_exists) {
        setFormWarning(pathLabel, pathInput, 'This path does not exist');
        disabled = true;
    } else {
        setFormWarning(pathLabel, pathInput, '');
    }

    importProjectButton.disabled = disabled;
}


async function editUpdateProject(projectIdx) {
    let pathInput = document.getElementById(`updateProjectPath${projectIdx}`);
    let pathLabel = document.getElementById(`updateProjectLabel${projectIdx}`);
    let updateProjectButton = document.getElementById(`updateProject${projectIdx}`);

    let path = pathInput.value;

    let directoriesResponse = await browseDirectory(path, '');

    let disabled = false;

    // Check that project path is filled, unique and exists
    if (path === '') {
        setFormWarning(pathLabel, pathInput, '');
        disabled = true;
    } else if (!directoriesResponse.path_unique) {
        setFormWarning(pathLabel, pathInput, 'Another project is already registered in this location');
        disabled = true;
    } else if (!directoriesResponse.path_exists) {
        setFormWarning(pathLabel, pathInput, 'This path does not exist');
        disabled = true;
    } else {
        setFormWarning(pathLabel, pathInput, '');
    }

    updateProjectButton.disabled = disabled;
}


async function editAddClass(projectName) {
    let classNameInput = document.getElementById('newClassName');
    let classNameLabel = document.getElementById('newClassNameLabel');
    let addClassButton = document.getElementById('addClass');

    let className = classNameInput.value;

    let config = await getProjectConfig(projectName);

    let disabled = false;

    // Check that class name is filled and unique
    if (className === '') {
        setFormWarning(classNameLabel, classNameInput, '');
        disabled = true;
    } else if (className in config.classes) {
        setFormWarning(classNameLabel, classNameInput, 'A class with this name already exists');
        disabled = true;
    } else {
        setFormWarning(classNameLabel, classNameInput, '');
    }

    addClassButton.disabled = disabled;
}


async function editUpdateClass(projectName, originalClassName, index) {
    let classNameInput = document.getElementById(`editClassName${index}`);
    let classNameLabel = document.getElementById(`editClassNameLabel${index}`);
    let editClassButton = document.getElementById(`submitEditClass${index}`);

    let className = classNameInput.value;

    let config = await getProjectConfig(projectName);

    let disabled = false;

    // Check that class name is filled and unique
    if (className === '') {
        setFormWarning(classNameLabel, classNameInput, 'Class name cannot be left empty');
        disabled = true;
    } else if (className !== originalClassName && className in config.classes) {
        setFormWarning(classNameLabel, classNameInput, 'A class with this name already exists');
        disabled = true;
    } else {
        setFormWarning(classNameLabel, classNameInput, '');
    }

    editClassButton.disabled = disabled;
}


function asyncRequest(url, data) {
    return new Promise(function (resolve, reject) {
        let xhttp = new XMLHttpRequest();

        xhttp.onload = function () {
            response = JSON.parse(xhttp.responseText);
            resolve(response);
        };

        if (data) {
            xhttp.open('POST', url, true);
            xhttp.setRequestHeader('Content-type', 'application/json; charset=utf-8');
            xhttp.send(JSON.stringify(data));
        } else {
            xhttp.open('GET', url, true);
            xhttp.send();
        }
    });
}


function browseDirectory(path, projectName) {
    return asyncRequest('/browse-directory', {path: path, project: projectName});
}


function getProjectConfig(projectName) {
    return asyncRequest('/project-config', {name: projectName});
}


function loadingButton(element, message, url) {
    let icon = element.children[0];
    let text = element.children[1];

    icon.removeAttribute('uk-icon');
    icon.setAttribute('uk-spinner', 'ratio: 0.6');
    text.innerHTML = message;
    element.disabled = true;

    if (url) {
        window.location = url;
    }
}


function loadingLink(element) {
    element.setAttribute('uk-spinner', 'ratio: 0.6');
    element.innerHTML = '';
}


function assignTag(frameIdx, selectedTagIdx,  classTagIndices) {
    let tagInput = document.getElementById(`${frameIdx}_tag`);
    tagInput.value = selectedTagIdx;

    for (const tagIdx of classTagIndices) {

        let button = document.getElementById(`${frameIdx}_tag${tagIdx}`);
        let buttonColor = tagIdx == 0 ? 'button-grey' : 'uk-button-primary';

        if (tagIdx == selectedTagIdx) {
            button.classList.add(buttonColor);
        } else {
            button.classList.remove(buttonColor);
        }
    }
}


function initTagButtons(annotations, classTagIndices) {
    for (let frameIdx = 0; frameIdx < annotations.length; frameIdx++) {
        assignTag(frameIdx, annotations[frameIdx], classTagIndices);
    }
}


function editClass(index, shouldEdit) {
    let classShow = document.getElementById(`classShow${index}`);
    let classEdit = document.getElementById(`classEdit${index}`);
    let className = document.getElementById(`editClassName${index}`);

    if (shouldEdit) {
        classShow.classList.add('uk-hidden');
        classEdit.classList.remove('uk-hidden');
    } else {
        classShow.classList.remove('uk-hidden');
        classEdit.classList.add('uk-hidden');
        className.value = className.attributes.value.value;
    }
}


async function toggleGPU(path) {
    let response = await asyncRequest('/toggle-project-setting', {path: path, setting: 'use_gpu'});

    let gpuInput = document.getElementById('gpuInput');
    gpuInput.checked = response.setting_status;
}


async function toggleMakeProjectTemporal(path) {
    let response = await asyncRequest('/toggle-project-setting', {path: path, setting: 'temporal'});

    let makeProjectTemporal = document.getElementById('makeProjectTemporal');
    let temporalElements = document.getElementsByClassName('temporal');

    makeProjectTemporal.checked = response.setting_status;

    // Show/hide all temporal-related elements
    for (element of temporalElements) {
        if (response.setting_status) {
            element.classList.remove('uk-hidden');
        } else {
            element.classList.add('uk-hidden');
        }
    }
}


async function toggleAssistedTagging(path) {
    let checkbox = document.getElementById('assistedTaggingCheckbox');
    let spinner = document.getElementById('assistedTaggingSpinner');

    checkbox.classList.add('uk-hidden');
    spinner.classList.remove('uk-hidden');

    let response = await asyncRequest('/toggle-project-setting', {path: path, setting: 'assisted_tagging'});

    // Reload page to update predictions
    window.location.reload();
}


function changeFps(element, originalModelFps) {
    UIkit.modal.confirm('Are you sure you want to change the model fps? ' +
                        'Your existing annotations will be converted to the new frame rate, ' +
                        'but some information might get lost or be inaccurate. ' +
                        'Please make sure to check the annotations after this operation.').then(function() {
        // Confirmed -> TODO: Change model fps and convert annotations
        console.log('Confirmed.')
    }, function () {
        // Cancelled -> Reset select field
        element.value = originalModelFps;
    });
}


async function addSelectedTagToClass(classIdx, className, path)  {
    let selectedTagsList = document.getElementById(`selectedTagsList${classIdx}`);
    let selectTagDropdown = document.getElementById(`selectTag${classIdx}`);

    let tagIndex = selectTagDropdown.value;
    let optionIndex = selectTagDropdown.selectedIndex;
    let tagName = selectTagDropdown.options[optionIndex].text;

    data = {
        className: className,
        tagIndex: tagIndex,
        path: path,
    };

    let response = await asyncRequest('/assign-tag-to-class', data);

    if (response.success) {
        // Remove tag from the dropdown
        selectTagDropdown.remove(optionIndex);
        selectTagDropdown.selectedIndex = "0";
        let tagListItem = `<li id="tagList${classIdx}-${tagIndex}">
                               <span uk-icon="icon: tag"></span>
                               ${tagName}
                               <a class="uk-float-right">
                                   <span uk-icon="icon: close" class="uk-text-danger"
                                         onclick="deselectTagFromList('${classIdx}', '${tagIndex}', '${tagName}', '${path}', '${className}');">
                                   </span>
                               </a>
                           </li>`;
        // Add selected tag from dropdown to tag list
        selectedTagsList.insertAdjacentHTML('beforeend', tagListItem);
    }
}


async function deselectTagFromList(classIdx, tagIndex, tagName, path, className) {
    let selectTagDropdown = document.getElementById(`selectTag${classIdx}`);
    let selectedTagFromList = document.getElementById(`tagList${classIdx}-${tagIndex}`);

    data = {
        path: path,
        tagIndex: tagIndex,
        className: className,
    };

    let response = await asyncRequest('/remove-tag-from-class', data);

    if (response.success) {
        // Remove tag from selected tag list of the class
        selectedTagFromList.parentNode.removeChild(selectedTagFromList);

        // Add tag back to the dropdown of the class
        let tagOption = `<option value="${tagIndex}">${tagName}</option>`;
        selectTagDropdown.insertAdjacentHTML('beforeend', tagOption);
    }
}

///////////////////////////////////////////// Tag Operations //////////////////////////////////////////////////

function checkIfTagExist(tags, tagId, errorLabelId, tagOperation, originalTagName) {
    let tag = document.getElementById(tagId);
    let errorLabel = document.getElementById(errorLabelId);
    let tagButton = document.getElementById(tagOperation);
    let tagNames = Object.values(tags);

    let disabled = false;

    if (tag.value === '') {
        setFormWarning(errorLabel, tag, '');
        disabled = true;
    } else if (tag.value !== originalTagName && tagNames.includes(tag.value)) {
        setFormWarning(errorLabel, tag, 'This tag name already exist');
        disabled = true;
    } else if (tag.value.toLowerCase() === 'background') {
        setFormWarning(errorLabel, tag, 'This name is reserved');
        disabled = true;
    } else {
        setFormWarning(errorLabel, tag, '');
    }

    tagButton.disabled = disabled;
}


function editTag(tagIdx) {
    let tagShow = document.getElementById(`tagShow${tagIdx}`);
    let tagEdit = document.getElementById(`tagEdit${tagIdx}`);

    tagEdit.classList.remove('uk-hidden');
    tagShow.classList.add('uk-hidden');
}


function cancelEditTag(tagIdx) {
    let tagShow = document.getElementById(`tagShow${tagIdx}`);
    let tagEdit = document.getElementById(`tagEdit${tagIdx}`);
    let tag = document.getElementById(`tag${tagIdx}`);
    let project = document.getElementById('projectName').value;
    let error = document.getElementById(`tagEditError${tagIdx}`);

    setFormWarning(error, tag, '');

    tag.value = tag.attributes.value.value;
    tagEdit.classList.add('uk-hidden');
    tagShow.classList.remove('uk-hidden');
}

///////////////////////////////////////////// Counterpart Class Operations //////////////////////////////////////////////////

function toggleVideoList(index, isHidden) {
    let copyVideoTags = document.getElementById(`copyVideoTags${index}`);
    if (isHidden) {
        copyVideoTags.classList.remove('uk-hidden');
    } else {
        copyVideoTags.classList.add('uk-hidden');
    }
}


function createCounterpartClass(index) {
    let counterpartClassShow = document.getElementById(`counterpartClassShow${index}`);
    let counterpartClassEdit = document.getElementById(`counterpartClassEdit${index}`);
    let counterpartClassName = document.getElementById(`counterpartClassName${index}`);
    let classNameInput = document.getElementById(`editCounterpartClassName${index}`);
    let className = classNameInput.value;

    counterpartClassName.innerHTML = className;
    counterpartClassEdit.classList.add('uk-hidden');
    counterpartClassShow.classList.remove('uk-hidden');
}

function editCounterpartClass(index, shouldEdit) {
    let counterpartClassShow = document.getElementById(`counterpartClassShow${index}`);
    let counterpartClassEdit = document.getElementById(`counterpartClassEdit${index}`);
    let counterpartClassNameLabel = document.getElementById(`counterpartClassNameLabel${index}`);
    let classNameInput = document.getElementById(`editCounterpartClassName${index}`);
    let className = document.getElementById(`editCounterpartClassName${index}`);

    if (shouldEdit) {
        counterpartClassShow.classList.add('uk-hidden');
        counterpartClassEdit.classList.remove('uk-hidden');
    } else {
        counterpartClassShow.classList.remove('uk-hidden');
        counterpartClassEdit.classList.add('uk-hidden');
        className.value = className.attributes.value.value;
        setFormWarning(counterpartClassNameLabel, classNameInput, '');
    }
}

function updateCounterpartClass(index) {
    let counterpartClassShow = document.getElementById(`counterpartClassShow${index}`);
    let counterpartClassEdit = document.getElementById(`counterpartClassEdit${index}`);
    let counterpartClassName = document.getElementById(`counterpartClassName${index}`);
    let counterpartClassNameLabel = document.getElementById(`counterpartClassNameLabel${index}`);
    let submitCounterpartClassButton = document.getElementById(`submitCounterpartClass${index}`);
    let classNameInput = document.getElementById(`editCounterpartClassName${index}`);
    let className = classNameInput.value;

    let disabled = false;

    // Check that class name is filled and unique
    if (className === '') {
        setFormWarning(counterpartClassNameLabel, classNameInput, 'Class name cannot be left empty');
        disabled = true;
    } else {
        setFormWarning(counterpartClassNameLabel, classNameInput, '');
    }
    submitCounterpartClassButton.disabled = disabled;
}


function showCounterpartClassFields(index) {
    let selectCounterpartClass = document.getElementById(`selectCounterpartClass${index}`);
    let counterpartClassEdit = document.getElementById(`counterpartClassEdit${index}`);
    let counterpartClassShow = document.getElementById(`counterpartClassShow${index}`);

    // Show/Hide counterpart class input field if dropdown value is -1.
    if (selectCounterpartClass.value == '-1') {
        counterpartClassEdit.classList.remove('uk-hidden');
    } else {
        counterpartClassEdit.classList.add('uk-hidden');
        counterpartClassShow.classList.add('uk-hidden');
    }
}

async function createCounterpartVideos(projectName, originalClassName, index, url) {
    let saveCounterpartsButton = document.getElementById(`saveCounterparts${index}`);

    let selectCounterpartClass = document.getElementById(`selectCounterpartClass${index}`);
    let copyTagsRadio = document.getElementsByName(`copyTag${index}`)[0];
    let counterpartClassName = null;
    let copyTags = false;

    let trainVideoList = document.getElementById(`trainVideoList${index}`);
    let validVideoList = document.getElementById(`validVideoList${index}`);
    let copyTrainVideoTags = [];
    let copyValidVideoTags = [];

    loadingButton(saveCounterpartsButton, 'Preparing');

    if (copyTagsRadio.value == 1 && copyTagsRadio.checked) {
        copyTags = true;
    }

    if (selectCounterpartClass.value === '-1') {
        counterpartClassName = document.getElementById(`counterpartClassName${index}`).innerHTML;
    } else {
        counterpartClassName = selectCounterpartClass.value;
    }

    if (copyTags) {
        // Create list of video names from train set whose tags need to be copied
        for (videos of trainVideoList.children) {
            let video = videos.children[0];
            if (video.checked) {
                copyTrainVideoTags.push(video.value);
            }
        }

        // Create list of video names from valid set whose tags need to be copied
        for (videos of validVideoList.children) {
            let video = videos.children[0];
            if (video.checked) {
                copyValidVideoTags.push(video.value);
            }
        }
    }

    data = {
        projectName: projectName,
        originalClassName : originalClassName,
        counterpartClassName: counterpartClassName,
        videosToCopyTags: {
            train: copyTrainVideoTags,
            valid: copyValidVideoTags
        }
    };

    let response = await asyncRequest(url, data);

    window.location.href = response.url;
}
