from django.shortcuts import render

def index_view(request):
    return render(request, 'index.html')

def cookies_view(request):
    return render(request, 'cookies.html')

def privacy_view(request):
    return render(request, 'privacy.html')

def merge_view(request):
    return render(request, 'merge.html')

def split_view(request):
    return render(request, 'split.html')