#!/usr/bin/env python
"""
Finetuning script that can be used to train a custom classifier on top of our pretrained models.

Usage:
  train_classifier.py  --path_in=PATH
                       [--num_layers_to_finetune=NUM]
                       [--use_gpu]
                       [--path_out=PATH]
                       [--path_annotations_train=PATH]
                       [--path_annotations_valid=PATH]
                       [--temporal_training]
                       [--resume]
                       [--overwrite]
  train_classifier.py  (-h | --help)

Options:
  --path_in=PATH                 Path to the dataset folder.
                                 Important: this folder should follow the structure described in the README.
  --num_layers_to_finetune=NUM   Number of layers to finetune in addition to the final layer [default: 9].
  --path_out=PATH                Where to save results. Will default to `path_in` if not provided.
  --path_annotations_train=PATH  Path to an annotation file. This argument is only useful if you want
                                 to fit a subset of the available training data. If provided, each entry
                                 in the json file should have the following format: {'file': NAME,
                                 'label': LABEL}.
  --path_annotations_valid=PATH  Same as '--path_annotations_train' but for validation examples.
  --temporal_training            Use this flag if your dataset has been annotated with the temporal
                                 annotations tool
  --resume                       Initialize weights from the last saved checkpoint and restart training
  --overwrite                    Allow overwriting existing checkpoint files in the output folder (path_out)
"""
import json
import os
import torch.utils.data

from docopt import docopt

from sense import backbone_networks
from sense.downstream_tasks.nn_utils import LogisticRegression
from sense.downstream_tasks.nn_utils import Pipe
from sense.finetuning import extract_features
from sense.finetuning import generate_data_loader
from sense.finetuning import set_internal_padding_false
from sense.finetuning import training_loops
from sense.utils import clean_pipe_state_dict_key

import sys


if __name__ == "__main__":
    # Parse arguments
    args = docopt(__doc__)
    path_in = args['--path_in']
    path_out = args['--path_out'] or os.path.join(path_in, "checkpoints")
    os.makedirs(path_out, exist_ok=True)
    use_gpu = args['--use_gpu']
    path_annotations_train = args['--path_annotations_train'] or None
    path_annotations_valid = args['--path_annotations_valid'] or None
    num_layers_to_finetune = int(args['--num_layers_to_finetune'])
    temporal_training = args['--temporal_training']
    resume = args['--resume']
    overwrite = args['--overwrite']

    # Check for existing files
    saved_files = ["last_classifier.checkpoint", "best_classifier.checkpoint", "label2int.json",
                   "confusion_matrix.png", "confusion_matrix.npy"]

    if not overwrite and any(os.path.exists(os.path.join(path_out, file)) for file in saved_files):
        print(f"Warning: This operation will overwrite files in {path_out}")

        while True:
            confirmation = input("Are you sure? Add --overwrite to hide this warning. (Y/N) ")
            if confirmation.lower() == "y":
                break
            elif confirmation.lower() == "n":
                sys.exit()
            else:
                print('Invalid input')

    # Load backbone network
    backbone_network = backbone_networks.StridedInflatedEfficientNet()

    if resume:
        # load the last classifier
        checkpoint_classifier = torch.load(os.path.join(path_out, 'last_classifier.checkpoint'))
        checkpoint = torch.load('resources/backbone/strided_inflated_efficientnet.ckpt')
        # Update original weights in case some intermediate layers have been finetuned
        name_finetuned_layers = set(checkpoint.keys()).intersection(checkpoint_classifier.keys())
        for key in name_finetuned_layers:
            checkpoint[key] = checkpoint_classifier.pop(key)
    else:
        checkpoint = torch.load('resources/backbone/strided_inflated_efficientnet.ckpt')

    backbone_network.load_state_dict(checkpoint)
    backbone_network.eval()

    # Get the require temporal dimension of feature tensors in order to
    # finetune the provided number of layers
    if num_layers_to_finetune > 0:
        num_timesteps = backbone_network.num_required_frames_per_layer.get(-num_layers_to_finetune)
        if not num_timesteps:
            # Remove 1 because we added 0 to temporal_dependencies
            num_layers = len(backbone_network.num_required_frames_per_layer) - 1
            raise IndexError(f'Num of layers to finetune not compatible. '
                             f'Must be an integer between 0 and {num_layers}')
    else:
        num_timesteps = 1
    minimum_frames = backbone_network.num_required_frames_per_layer[0]

    # Extract layers to finetune
    if num_layers_to_finetune > 0:
        fine_tuned_layers = backbone_network.cnn[-num_layers_to_finetune:]
        backbone_network.cnn = backbone_network.cnn[0:-num_layers_to_finetune]

    # finetune the model
    extract_features(path_in, backbone_network, num_layers_to_finetune, use_gpu,
                     num_timesteps=num_timesteps)

    # Find label names
    label_names = os.listdir(os.path.join(os.path.join(path_in, "videos_train")))
    label_names = [x for x in label_names if not x.startswith('.')]
    label_counting = ['counting_background']

    for label in label_names:
        label_counting += [f'{label}_position_1', f'{label}_position_2']

    label2int_temporal_annotation = {name: index for index, name in enumerate(label_counting)}
    label2int = {name: index for index, name in enumerate(label_names)}

    extractor_stride = backbone_network.num_required_frames_per_layer_padding[0]

    # create the data loaders
    train_loader = generate_data_loader(path_in, f"features_train_num_layers_to_finetune={num_layers_to_finetune}",
                                        "tags_train", label_names, label2int, label2int_temporal_annotation,
                                        num_timesteps=num_timesteps, stride=extractor_stride,
                                        temporal_annotation_only=temporal_training)

    valid_loader = generate_data_loader(path_in, f"features_valid_num_layers_to_finetune={num_layers_to_finetune}",
                                        "tags_valid", label_names, label2int, label2int_temporal_annotation,
                                        num_timesteps=None, batch_size=1, shuffle=False, stride=extractor_stride,
                                        temporal_annotation_only=temporal_training)

    # modeify the network to generate the training network on top of the features
    if temporal_training:
        num_output = len(label_counting)
    else:
        num_output = len(label_names)

    # modify the network to generate the training network on top of the features
    gesture_classifier = LogisticRegression(num_in=backbone_network.feature_dim,
                                            num_out=num_output,
                                            use_softmax=False)

    if resume:
        gesture_classifier.load_state_dict(checkpoint_classifier)

    if num_layers_to_finetune > 0:
        # remove internal padding for training
        fine_tuned_layers.apply(set_internal_padding_false)
        net = Pipe(fine_tuned_layers, gesture_classifier)
    else:
        net = gesture_classifier
    net.train()

    if use_gpu:
        net = net.cuda()

    lr_schedule = {0: 0.0001, 40: 0.00001}
    num_epochs = 80
    best_model_state_dict = training_loops(net, train_loader, valid_loader, use_gpu, num_epochs, lr_schedule,
                                           label_names, path_out, temporal_annotation_training=temporal_training)

    # Save best model
    if isinstance(net, Pipe):
        best_model_state_dict = {clean_pipe_state_dict_key(key): value
                                 for key, value in best_model_state_dict.items()}
    torch.save(best_model_state_dict, os.path.join(path_out, "best_classifier.checkpoint"))

    if temporal_training:
        json.dump(label2int_temporal_annotation, open(os.path.join(path_out, "label2int.json"), "w"))
    else:
        json.dump(label2int, open(os.path.join(path_out, "label2int.json"), "w"))
