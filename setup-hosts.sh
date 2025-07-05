#!/bin/bash

echo "Add these entries to your /etc/hosts file:"
echo ""
echo "192.168.49.2 meme-generator.local nats.meme-generator.local"
echo ""
echo "You can do this by running:"
echo "sudo sh -c 'echo \"192.168.49.2 meme-generator.local nats.meme-generator.local\" >> /etc/hosts'"
echo ""
echo "Then access the frontend at: http://meme-generator.local"